import { StreamlineGenerator, StreamlineParams } from './streamlines';
import PolygonUtil from './polygon-util';
import { Vector } from './vector';
import { FieldIntegrator } from './integrator';
import { TensorField } from './tensor-field';
import { rm } from 'fs';


export interface WaterParams extends StreamlineParams {
  coastNoise: NoiseStreamlineParams;
  riverNoise: NoiseStreamlineParams;
  riverBankSize: number;
  riverSize: number;
}

export interface NoiseStreamlineParams {
  noiseEnabled: boolean;
  noiseSize: number;
  noiseAngle: number;
}

/**
 * Integrates polylines to create coastline and river, with controllable noise
 */
export default class WaterGenerator extends StreamlineGenerator {
  private readonly TRIES = 100;
  private coastlineMajor = true;
  private _coastline: Vector[] = []; // Noisy line
  private _seaPolygons: Vector[][] = []; // Uses screen rectangle and simplified road
  private _riverPolygons: Vector[][] = []; // Simplified
  private _riverSecondaryRoad: Vector[] = [];
  private _riverStreamlines: Vector[][] = [];

  constructor(
    integrator: FieldIntegrator,
    origin: Vector,
    worldDimensions: Vector,
    protected params: WaterParams,
    private tensorField: TensorField,
  ) {
    super(integrator, origin, worldDimensions, params);
  }

  get coastline(): Vector[] {
    return this._coastline;
  }

  get seaPolygons(): Vector[][] {
    return this._seaPolygons;
  }

  get riverPolygons(): Vector[][] {
    return this._riverPolygons;
  }

  get riverSecondaryRoad(): Vector[] {
    return this._riverSecondaryRoad;
  }

  createCoast(): void {
    let coastStreamline: Vector[] = [];
    let seed;
    let major = false;

    if (this.params.coastNoise.noiseEnabled) {
      this.tensorField.enableGlobalNoise(this.params.coastNoise.noiseAngle, this.params.coastNoise.noiseSize);
    }

    for (let i = 0; i < this.TRIES; i++) {
      major = Math.random() < 0.5;
      seed = this.getSeed(major);
      if (!seed) {
        throw new Error('Seed is null');
      }
      coastStreamline = this.extendStreamline(this.integrateStreamline(seed, major));

      if (this.reachesEdges(coastStreamline)) {
        break;
      }
    }

    this.tensorField.disableGlobalNoise();

    this._coastline = coastStreamline;
    this.coastlineMajor = major;

    const road = this.simplifyStreamline(coastStreamline);
    this._seaPolygons.push(this.getSeaPolygon(road));
    this.allStreamlinesSimple.push(road);
    this.tensorField.seas = this._seaPolygons;

    // Create intermediate samples
    const complex = this.complexifyStreamline(road);
    this.grid(major).addPolyline(complex);
    this.streamlines(major).push(complex);
    this.allStreamlines.push(complex);
  }

  createCoastFromData(feature: any, originPoint: Vector): void {
    let coastStreamline: Vector[] = [];
    let major = false;

    const coords = feature.geometry.coordinates;
    if (!coords) {
      console.log('coords are broken');
      throw new Error('Coords are null');
    }

    if (this.params.coastNoise.noiseEnabled) {
      this.tensorField.enableGlobalNoise(this.params.coastNoise.noiseAngle, this.params.coastNoise.noiseSize);
    }
    originPoint = this.latlongToMercator(originPoint.x, originPoint.y);
    if (coords.length > 1) {
      for (let i = 0; i < coords.length; i++) {
        const lat = coords[i][1];
        const long = coords[i][0];
        let v = this.latlongToMercator(lat, long);
        v.x -= originPoint.x;
        v.y -= originPoint.y;
        if (!v) {
          console.log('vector is broken');
          throw new Error('Vector failed to be created');
        }
        coastStreamline.push(v);
      }
    }
    else {
      for (let i = 0; i < coords[0].length; i++) {
        const lat = coords[0][i][1];
        const long = coords[0][i][0];
        let v = this.latlongToMercator(lat, long);
        v.x -= originPoint.x;
        v.y -= originPoint.y;
        if (!v) {
          console.log('vector is broken');
          throw new Error('Vector failed to be created');
        }
        coastStreamline.push(v);
      }
    }
    

    this.tensorField.disableGlobalNoise();
    
    this._coastline = coastStreamline;
    this.coastlineMajor = major;
    const road = this.simplifyStreamline(coastStreamline);
    if (coords.length > 1) {
      this._seaPolygons.push(this.getSeaPolygon(road));
      this.allStreamlinesSimple.push(road);
      this.tensorField.seas = this._seaPolygons;
    }
    else {
      this._seaPolygons.push(coastStreamline);
      this.allStreamlinesSimple.push(road);
      this.tensorField.seas = this._seaPolygons;
    }

    // Create intermediate samples
    const complex = this.complexifyStreamline(road);
    this.grid(major).addPolyline(complex);
    this.streamlines(major).push(complex);
    this.allStreamlines.push(complex);
  }

  createRiver(): void {
    let riverStreamline: Vector[] = [];
    let seed;

    // Need to ignore sea when integrating for edge check
    const oldSea = this.tensorField.seas;
    this.tensorField.seas = [];
    if (this.params.riverNoise.noiseEnabled) {
      this.tensorField.enableGlobalNoise(this.params.riverNoise.noiseAngle, this.params.riverNoise.noiseSize);
    }
    for (let i = 0; i < this.TRIES; i++) {
      seed = this.getSeed(!this.coastlineMajor);
      if (!seed) {
        throw new Error('Seed is undefined');
      }
      riverStreamline = this.extendStreamline(this.integrateStreamline(seed, !this.coastlineMajor));

      if (this.reachesEdges(riverStreamline)) {
        break;
      } else if (i === this.TRIES - 1) {
        console.log('Failed to find river reaching edge');
      }
    }
    this.tensorField.seas = oldSea;
    this.tensorField.disableGlobalNoise();

    // Create river roads
    const expandedNoisy = this.complexifyStreamline(
      PolygonUtil.resizeGeometry(riverStreamline, this.params.riverSize, false),
    );
    this._riverPolygons.push(PolygonUtil.resizeGeometry(
      riverStreamline,
      this.params.riverSize - this.params.riverBankSize,
      false,
    ));
    // Make sure riverPolygon[0] is off screen
    const firstOffScreen = expandedNoisy.findIndex((v) => this.vectorOffScreen(v));
    for (let i = 0; i < firstOffScreen; i++) {
      const enShift = expandedNoisy.shift();
      if (enShift) {
        expandedNoisy.push(enShift);
      }
    }

    // Create river roads
    const riverSplitPoly = this.getSeaPolygon(riverStreamline);
    const road1 = expandedNoisy.filter(
      (v) =>
        !PolygonUtil.insidePolygons(v, this._seaPolygons) &&
        !this.vectorOffScreen(v) &&
        PolygonUtil.insidePolygon(v, riverSplitPoly),
    );
    const road1Simple = this.simplifyStreamline(road1);
    const road2 = expandedNoisy.filter(
      (v) =>
        !PolygonUtil.insidePolygons(v, this._seaPolygons) &&
        !this.vectorOffScreen(v) &&
        !PolygonUtil.insidePolygon(v, riverSplitPoly),
    );
    const road2Simple = this.simplifyStreamline(road2);

    if (road1.length === 0 || road2.length === 0) return;

    if (road1[0].distanceToSquared(road2[0]) < road1[0].distanceToSquared(road2[road2.length - 1])) {
      road2Simple.reverse();
    }

    this.tensorField.river = road1Simple.concat(road2Simple);

    // Road 1
    this.allStreamlinesSimple.push(road1Simple);
    this._riverSecondaryRoad = road2Simple;

    this.grid(!this.coastlineMajor).addPolyline(road1);
    this.grid(!this.coastlineMajor).addPolyline(road2);
    this.streamlines(!this.coastlineMajor).push(road1);
    this.streamlines(!this.coastlineMajor).push(road2);
    this.allStreamlines.push(road1);
    this.allStreamlines.push(road2);
  }

  createRiverFromData(feature: any, originPoint: Vector): void {
    let riverStreamline: Vector[] = [];
    let seed;
    originPoint = this.latlongToMercator(originPoint.x, originPoint.y);
    // Need to ignore sea when integrating for edge check
    const oldSea = this.tensorField.seas;
    this.tensorField.seas = [];
    if (this.params.riverNoise.noiseEnabled) {
      this.tensorField.enableGlobalNoise(this.params.riverNoise.noiseAngle, this.params.riverNoise.noiseSize);
    }
    const data = feature.geometry.coordinates;
    for (let i = 0; i < data.length; i++) {
      const lat = data[i][1];
      const long = data[i][0];
      seed = this.latlongToMercator(lat, long);
      if (!seed) {
        throw new Error('Seed is undefined');
      }
      seed.x -= originPoint.x;
      seed.y -= originPoint.y;

      riverStreamline.push(seed);
      
    }
    this.tensorField.seas = oldSea;
    this.tensorField.disableGlobalNoise();

    // Create river roads
    this._riverStreamlines.push(riverStreamline);

    let riverPoly = PolygonUtil.resizeGeometry(
      riverStreamline,
      this.params.riverSize - this.params.riverBankSize,
      false
    );
    this._riverPolygons.push(riverPoly);
  }

  public createRiverRoads(): void {
    this.sortRiverElements();
    for (const riverStreamline of this._riverStreamlines) {
      const expandedNoisy = this.complexifyStreamline(
        PolygonUtil.resizeGeometry(riverStreamline, this.params.riverSize, false),
      );
      // Make sure riverPolygon[0] is off screen
      const firstOffScreen = expandedNoisy.findIndex((v) => this.isRightmostVector(expandedNoisy, v));
      for (let i = 0; i < firstOffScreen; i++) {
        const enShift = expandedNoisy.shift();
        if (enShift) {
          expandedNoisy.push(enShift);
        }
      }
  
      // Create river roads
      const road1 = expandedNoisy.filter(
        (v) =>
          !PolygonUtil.insidePolygons(v, this._seaPolygons) && 
          !this.vectorOffScreen(v) &&
          !PolygonUtil.insidePolygons(v, this._riverPolygons)
      );
      const road1Simple = this.simplifyStreamline(road1);
      const road2 = expandedNoisy.filter(
        (v) =>
          !PolygonUtil.insidePolygons(v, this._seaPolygons) &&
          !this.vectorOffScreen(v) &&
          !PolygonUtil.insidePolygons(v, this._riverPolygons)
      );
      const road2Simple = this.simplifyStreamline(road2);
  
      if (road1.length === 0 || road2.length === 0) return;
  
      if (road1[0].distanceToSquared(road2[0]) < road1[0].distanceToSquared(road2[road2.length - 1])) {
        road2Simple.reverse();
      }
  
      this.tensorField.river = this.tensorField.river.concat(road1Simple);
  
      // Road 1
      this.allStreamlinesSimple.push(road1Simple);
      this._riverSecondaryRoad = road1Simple;
  
      this.grid(!this.coastlineMajor).addPolyline(road1);
      // this.grid(!this.coastlineMajor).addPolyline(road2);
      this.streamlines(!this.coastlineMajor).push(road1);
      // this.streamlines(!this.coastlineMajor).push(road2);
      this.allStreamlines.push(road1);
      // this.allStreamlines.push(road2);
    }
  }

  public sortRiverElements(): void {
    this._riverPolygons.sort((a, b) => this.rightmostVector(a).x - this.rightmostVector(b).x);
    this._riverPolygons.forEach((a) => console.log(JSON.stringify(this.rightmostVector(a))));
    this._riverStreamlines.sort((a, b) => this.rightmostVector(a).x - this.rightmostVector(b).x);
  }

  /**
   * Assumes simplified
   * Used for adding river roads
   */
  private manuallyAddStreamline(s: Vector[], major: boolean): void {
    this.allStreamlinesSimple.push(s);
    // Create intermediate samples
    const complex = this.complexifyStreamline(s);
    this.grid(major).addPolyline(complex);
    this.streamlines(major).push(complex);
    this.allStreamlines.push(complex);
  }

  /**
   * Might reverse input array
   */
  private getSeaPolygon(polyline: Vector[]): Vector[] {
    // const seaPolygon = PolygonUtil.sliceRectangle(this.origin, this.worldDimensions,
    //     polyline[0], polyline[polyline.length - 1]);

    // // Replace the longest side with coastline
    // let longestIndex = 0;
    // let longestLength = 0;
    // for (let i = 0; i < seaPolygon.length; i++) {
    //     const next = (i + 1) % seaPolygon.length;
    //     const d = seaPolygon[i].distanceToSquared(seaPolygon[next]);
    //     if (d > longestLength) {
    //         longestLength = d;
    //         longestIndex = i;
    //     }
    // }

    // const insertBackwards = seaPolygon[longestIndex].distanceToSquared(polyline[0]) > seaPolygon[longestIndex].distanceToSquared(polyline[polyline.length - 1]);
    // if (insertBackwards) {
    //     polyline.reverse();
    // }

    // seaPolygon.splice((longestIndex + 1) % seaPolygon.length, 0, ...polyline);

    const start = polyline[0];
    const end = polyline[polyline.length - 1];
    const xRange = Math.abs(end.x - start.x);
    const yRange = Math.abs(end.y - start.y);
    let seaOrigin = Vector.zeroVector();
    if (start.x < end.x) {
      seaOrigin.x = start.x;
    }
    else {
      seaOrigin.x = end.x;
    }
    if (start.y < end.y) {
      seaOrigin.y = start.y;
    }
    else {
      seaOrigin.y = end.y;
    }
    const offset = 500;
    let seaDims = new Vector(xRange, yRange);
    if (yRange > xRange) {
      seaOrigin.x -= offset;
      seaDims.x += offset;
    }
    else if (yRange < xRange) {
      seaOrigin.y -= offset;
      seaDims.y += offset;
    }
    else {
      seaOrigin.x -= offset;
      seaDims.x += offset;
      seaOrigin.y -= offset;
      seaDims.y += offset;
    }
    
    return PolygonUtil.lineRectanglePolygonIntersection(seaOrigin, seaDims, polyline);

    // return PolygonUtil.boundPolyToScreen(this.origin, this.worldDimensions, seaPolygon);
  }

  /**
   * Insert samples in streamline until separated by dstep
   */
  private complexifyStreamline(s: Vector[]): Vector[] {
    const out: Vector[] = [];
    for (let i = 0; i < s.length - 1; i++) {
      out.push(...this.complexifyStreamlineRecursive(s[i], s[i + 1]));
    }
    return out;
  }

  private complexifyStreamlineRecursive(v1: Vector, v2: Vector): Vector[] {
    if (v1.distanceToSquared(v2) <= this.paramsSq.dstep) {
      return [v1, v2];
    }
    const d = v2.clone().sub(v1);
    const halfway = v1.clone().add(d.multiplyScalar(0.5));

    const complex = this.complexifyStreamlineRecursive(v1, halfway);
    complex.push(...this.complexifyStreamlineRecursive(halfway, v2));
    return complex;
  }

  /**
   * Mutates streamline
   */
  private extendStreamline(streamline: Vector[]): Vector[] {
    streamline.unshift(
      streamline[0].clone().add(
        streamline[0]
          .clone()
          .sub(streamline[1])
          .setLength(this.params.dstep * 5),
      ),
    );
    streamline.push(
      streamline[streamline.length - 1].clone().add(
        streamline[streamline.length - 1]
          .clone()
          .sub(streamline[streamline.length - 2])
          .setLength(this.params.dstep * 5),
      ),
    );
    return streamline;
  }

  private reachesEdges(streamline: Vector[]): boolean {
    return this.vectorOffScreen(streamline[0]) && this.vectorOffScreen(streamline[streamline.length - 1]);
  }

  private vectorOffScreen(v: Vector): boolean {
    const toOrigin = v.clone().sub(this.origin);
    return (
      toOrigin.x <= 0 || toOrigin.y <= 0 || toOrigin.x >= this.worldDimensions.x || toOrigin.y >= this.worldDimensions.y
    );
  }

  private rightmostVector(streamline: Vector[]): Vector {
    let rightmost = new Vector(-Infinity, -Infinity);
    for (const v of streamline) {
      if (v.x > rightmost.x) {
        rightmost = v;
      }
    }

    return rightmost;
  }

  private isRightmostVector(streamline: Vector[], point: Vector): boolean {
    if (point == this.rightmostVector(streamline)) {
      return true;
    }
    return false;
  }

  private aboveStreamline(point: Vector, streamline: Vector[]): boolean {
    let closest = new Vector(Infinity, Infinity);
    for (const v of streamline) {
      const diffX = Math.abs(point.x - v.x);
      if (diffX < Math.abs(closest.x - point.x)) {
        closest = v;
      }
    }

    if (closest.y < point.y) {
      return false;
    }

    return true;
  }
}

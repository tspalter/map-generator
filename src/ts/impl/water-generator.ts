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
  private _riverPolygon: Vector[] = []; // Simplified
  private _riverSecondaryRoad: Vector[] = [];

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

  get riverPolygon(): Vector[] {
    return this._riverPolygon;
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
    this.tensorField.sea = this._seaPolygons[this._seaPolygons.length - 1];

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
        let v = this.latlongToUTM(lat, long);
        v = this.latlongToMercator(lat, long);
        v.x -= originPoint.x;
        v.y -= originPoint.y;
        v.y *= -1;
        if (!v) {
          console.log('vector is broken');
          throw new Error('Vector failed to be created');
        }
        console.log("v: " + v.x + ", " + v.y);
        coastStreamline.push(v);
      }
    }
    else {
      for (let i = 0; i < coords[0].length; i++) {
        const lat = coords[0][i][1];
        const long = coords[0][i][0];
        let v = this.latlongToUTM(lat, long);
        v = this.latlongToMercator(lat, long);
        v.x -= originPoint.x;
        v.y -= originPoint.y;
        v.y *= -1;
        if (!v) {
          console.log('vector is broken');
          throw new Error('Vector failed to be created');
        }
        console.log("v: " + v.x + ", " + v.y);
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
      this.tensorField.sea = this._seaPolygons[this._seaPolygons.length - 1];
    }
    else {
      this._seaPolygons.push(coastStreamline);
      this.allStreamlinesSimple.push(road);
      this.tensorField.sea = this._seaPolygons[this._seaPolygons.length - 1];
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
    const oldSea = this.tensorField.sea;
    this.tensorField.sea = [];
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
    this.tensorField.sea = oldSea;
    this.tensorField.disableGlobalNoise();

    // Create river roads
    const expandedNoisy = this.complexifyStreamline(
      PolygonUtil.resizeGeometry(riverStreamline, this.params.riverSize, false),
    );
    this._riverPolygon = PolygonUtil.resizeGeometry(
      riverStreamline,
      this.params.riverSize - this.params.riverBankSize,
      false,
    );
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

    return PolygonUtil.lineRectanglePolygonIntersection(this.origin, this.worldDimensions, polyline);

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

  private latlongToUTM(lat: number, long: number): Vector {
    // find the central meridian
    let centralMeridian = this.findCentralMeridian(long);
    // convert lat and long to radians
    lat = lat * Math.PI / 180;
    long = long * Math.PI / 180;
    centralMeridian = centralMeridian * Math.PI / 180;

    // cross sections of the Earth
    const a = 6378000;
    const b = 6357000;

    // other constants
    const k0 = 0.9996;
    const e = Math.sqrt(1 - (Math.pow(b, 2) / Math.pow(a, 2))); // Earth's eccentricity
    const ePrimeSquared = Math.pow((e * a / b), 2);
    const n = (a - b) / (a + b);
    const nu = a / Math.pow(1 - (Math.pow(e, 2) * Math.pow(Math.sin(lat), 2)), 0.5);
    const p = long - centralMeridian;

    // calculate the meridonial arc, approximated to the 10th order
    const c1 = 1 + ((3/4)*Math.pow(e, 2)) + ((45/64)*Math.pow(e, 4))+ ((175/256)*Math.pow(e, 6))+ ((11025/16384)*Math.pow(e, 8))+ ((43659/65536)*Math.pow(e, 10));
    const c2 = ((3/4)*Math.pow(e, 2)) + ((15/16)*Math.pow(e, 4)) + ((525/512)*Math.pow(e, 6)) + ((2205/2048)*Math.pow(e, 8)) + ((72765/65536)*Math.pow(e, 10));
    const c3 = ((15/64)*Math.pow(e, 4)) + ((105/256)*Math.pow(e, 6)) + ((2205/4096)*Math.pow(e, 8)) + ((10395/16384)*Math.pow(e, 10));
    const c4 = ((35/512)*Math.pow(e, 6)) + ((315/2048)*Math.pow(e, 8)) + ((31185/131072)*Math.pow(e, 10));
    const c5 = ((315/16384)*Math.pow(e, 8)) + ((3465/65536)*Math.pow(e, 10));
    const c6 = ((693/131072)*Math.pow(e, 10));

    const meridonialArc = a * (1 - Math.pow(e, 2)) * ((c1 * lat) - (c2 * (Math.sin(2*lat) / 2)) + (c3 * (Math.sin(4*lat) / 4)) - (c4 * (Math.sin(6*lat) / 6)) + (c5 * (Math.sin(8*lat) / 8)) - (c6 * (Math.sin(10*lat) / 10)));

    // now calculate northing and easting
    const k1 = meridonialArc * k0;
    const k2 = k0 * nu * Math.sin(lat) * Math.cos(lat) / 2;
    const k3 = (k0 * nu * Math.sin(lat) * Math.pow(Math.cos(lat), 3) / 24) * (5 - Math.pow(Math.tan(lat), 2) + 9 * ePrimeSquared * Math.pow(Math.cos(lat), 2) + 4 * Math.pow(ePrimeSquared, 2) * Math.pow(Math.cos(lat), 4));
    const northing = k1 + k2 * Math.pow(p, 2) + k3 * Math.pow(p, 4);

    const k4 = k0 * nu * Math.cos(lat);
    const k5 = (k0 * nu * Math.pow(Math.cos(lat), 3) / 6) * (1 - Math.pow(Math.tan(lat), 2) + ePrimeSquared * Math.pow(Math.cos(lat), 2));
    const easting = k4 * p + k5 * Math.pow(p, 3);
    const vec = new Vector(northing, easting);
    return vec;
  }

  private findCentralMeridian(long: number): number {
    let lowEnd = -180;
    for (let highEnd = -174; highEnd <= 180; highEnd += 6) {
      if (long < highEnd && long > lowEnd) {
        return highEnd - 3;
      }
      lowEnd = highEnd;
    }
    return 0;
  }

  public DegToRad(ang: number) : number {
    return ang * (Math.PI / 180);
  }

  public mercatorX(long: number) : number {
    const rMajor = 6378137;
    return rMajor * this.DegToRad(long);
  }

  public mercatorY(lat: number) : number {
    if (lat > 89.5) {
      lat = 89.5;
    }
    if (lat < -89.5) {
      lat = 89.5;
    }
    const rMajor = 6378137;
    const rMinor = 6356752.3142;
    const temp = rMinor / rMajor;
    const es = 1 - (temp * temp);
    const eccentricity = Math.sqrt(es);
    const phi = this.DegToRad(lat);
    const sinPhi = Math.sin(phi);
    let con = eccentricity * sinPhi;
    const com = 0.5 * eccentricity;
    con = Math.pow((1 - con) / (1 + con), com);
    const ts = Math.tan(Math.PI *0.25 - phi * 0.5) / con;
    return 0 - (rMajor * Math.log(ts));
  }

  public latlongToMercator(lat: number, long: number) : Vector {
    return new Vector(Math.floor(this.mercatorX(long)), Math.floor(this.mercatorY(lat)));
  }
}

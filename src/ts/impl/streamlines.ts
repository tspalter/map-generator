import { FieldIntegrator } from './integrator';
import { Vector } from './vector';
import GridStorage from './grid-storage';
import simplify from 'simplify-js';

interface StreamlineIntegration {
  seed: Vector;
  originalDir: Vector;
  streamline: Vector[];
  previousDirection: Vector;
  previousPoint: Vector;
  valid: boolean;
}

export interface StreamlineParams {
  [key: string]: any;

  dsep: number; // Streamline seed separating distance
  dtest: number; // Streamline integration separating distance
  dstep: number; // Step size
  dcirclejoin: number; // How far to look to join circles - (e.g. 2 x dstep)
  dlookahead: number; // How far to look ahead to join up dangling
  joinangle: number; // Angle to join roads in radians
  pathIterations: number; // Path integration iteration limit
  seedTries: number; // Max failed seeds
  simplifyTolerance: number;
  collideEarly: number; // Chance of early collision 0-1
}

/**
 * Creates polylines that make up the roads by integrating the tensor field
 * See the paper 'Interactive Procedural Street Modeling' for a thorough explanation
 */
export class StreamlineGenerator {
  protected readonly SEED_AT_ENDPOINTS = false;
  protected readonly NEAR_EDGE = 3; // Sample near edge

  protected majorGrid: GridStorage;
  protected minorGrid: GridStorage;
  protected paramsSq: StreamlineParams;

  // How many samples to skip when checking streamline collision with itself
  protected nStreamlineStep: number;
  // How many samples to ignore backwards when checking streamline collision with itself
  protected nStreamlineLookBack: number;
  protected dcollideselfSq: number;

  protected candidateSeedsMajor: Vector[] = [];
  protected candidateSeedsMinor: Vector[] = [];

  protected streamlinesDone = true;
  //protected resolve: () => void;
  protected lastStreamlineMajor = true;

  public allStreamlines: Vector[][] = [];
  public streamlinesMajor: Vector[][] = [];
  public streamlinesMinor: Vector[][] = [];
  public allStreamlinesSimple: Vector[][] = []; // Reduced vertex count

  /**
   * Uses world-space coordinates
   */
  constructor(
    protected integrator: FieldIntegrator,
    protected origin: Vector,
    protected worldDimensions: Vector,
    protected params: StreamlineParams,
  ) {
    if (params.dstep > params.dsep) {
      console.log('STREAMLINE SAMPLE DISTANCE BIGGER THAN DSEP');
    }

    // Enforce test < sep
    params.dtest = Math.min(params.dtest, params.dsep);

    // Needs to be less than circlejoin
    this.dcollideselfSq = (params.dcirclejoin / 2) ** 2;
    this.nStreamlineStep = Math.floor(params.dcirclejoin / params.dstep);
    this.nStreamlineLookBack = 2 * this.nStreamlineStep;

    this.majorGrid = new GridStorage(this.worldDimensions, this.origin, params.dsep);
    this.minorGrid = new GridStorage(this.worldDimensions, this.origin, params.dsep);

    this.paramsSq = Object.assign({}, this.params);
    for (const p in this.paramsSq) {
      if (typeof this.paramsSq[p] === 'number') {
        this.paramsSq[p] *= this.paramsSq[p];
      }
    }
  }

  clearStreamlines(): void {
    this.allStreamlinesSimple = [];
    this.streamlinesMajor = [];
    this.streamlinesMinor = [];
    this.allStreamlines = [];
  }

  /**
   * Edits streamlines
   */
  joinDanglingStreamlines(): void {
    // TODO do in update method
    for (const major of [true, false]) {
      for (const streamline of this.streamlines(major)) {
        // Ignore circles
        if (streamline[0].equals(streamline[streamline.length - 1])) {
          continue;
        }

        const newStart = this.getBestNextPoint(streamline[0], streamline[4]);
        if (newStart !== null) {
          for (const p of this.pointsBetween(streamline[0], newStart, this.params.dstep)) {
            streamline.unshift(p);
            this.grid(major).addSample(p);
          }
        }

        const newEnd = this.getBestNextPoint(streamline[streamline.length - 1], streamline[streamline.length - 4]);
        if (newEnd !== null) {
          for (const p of this.pointsBetween(streamline[streamline.length - 1], newEnd, this.params.dstep)) {
            streamline.push(p);
            this.grid(major).addSample(p);
          }
        }
      }
    }

    // Reset simplified streamlines
    this.allStreamlinesSimple = [];
    for (const s of this.allStreamlines) {
      this.allStreamlinesSimple.push(this.simplifyStreamline(s));
    }
  }

  /**
   * Returns array of points from v1 to v2 such that they are separated by at most dsep
   * not including v1
   */
  pointsBetween(v1: Vector, v2: Vector, dstep: number): Vector[] {
    const d = v1.distanceTo(v2);
    const nPoints = Math.floor(d / dstep);
    if (nPoints === 0) return [];

    const stepVector = v2.clone().sub(v1);

    const out = [];
    let i = 1;
    let next = v1.clone().add(stepVector.clone().multiplyScalar(i / nPoints));
    for (i = 1; i <= nPoints; i++) {
      if (this.integrator.integrate(next, true).lengthSq() > 0.001) {
        // Test for degenerate point
        out.push(next);
      } else {
        return out;
      }
      next = v1.clone().add(stepVector.clone().multiplyScalar(i / nPoints));
    }
    return out;
  }

  /**
   * Gets next best point to join streamline
   * returns null if there are no good candidates
   */
  getBestNextPoint(point: Vector, previousPoint: Vector): Vector | null {
    const nearbyPoints = this.majorGrid.getNearbyPoints(point, this.params.dlookahead);
    const minorNearbyPoints = this.minorGrid.getNearbyPoints(point, this.params.dlookahead);
    for (const point of minorNearbyPoints) {
      nearbyPoints.push(point);
    }
    // nearbyPoints.push(...this.minorGrid.getNearbyPoints(point, this.params.dlookahead));
    const direction = point.clone().sub(previousPoint);

    let closestSample = null;
    let closestDistance = Infinity;

    for (const sample of nearbyPoints) {
      if (!sample.equals(point) && !sample.equals(previousPoint)) {
        // && !streamline.includes(sample)) {
        const differenceVector = sample.clone().sub(point);
        if (differenceVector.dot(direction) < 0) {
          // Backwards
          continue;
        }

        // Acute angle between vectors (agnostic of CW, ACW)
        const distanceToSample = point.distanceToSquared(sample);
        if (distanceToSample < 2 * this.paramsSq.dstep) {
          closestSample = sample;
          break;
        }
        const angleBetween = Math.abs(Vector.angleBetween(direction, differenceVector));

        // Filter by angle
        if (angleBetween < this.params.joinangle && distanceToSample < closestDistance) {
          closestDistance = distanceToSample;
          closestSample = sample;
        }
      }
    }

    // TODO is reimplement simplify-js to preserve intersection points
    //  - this is the primary reason polygons aren't found
    // If trying to find intersections in the simplified graph
    // prevent ends getting pulled away from simplified lines
    if (closestSample !== null) {
      closestSample = closestSample.clone().add(direction.setLength(this.params.simplifyTolerance * 4));
    }

    return closestSample;
  }

  /**
   * Assumes s has already generated
   */
  addExistingStreamlines(s: StreamlineGenerator): void {
    this.majorGrid.addAll(s.majorGrid);
    this.minorGrid.addAll(s.minorGrid);
  }

  setGrid(s: StreamlineGenerator): void {
    this.majorGrid = s.majorGrid;
    this.minorGrid = s.minorGrid;
  }

  /**
   * returns true if state updates
   */
  update(): boolean {
    if (!this.streamlinesDone) {
      this.lastStreamlineMajor = !this.lastStreamlineMajor;
      if (!this.createStreamline(this.lastStreamlineMajor)) {
        this.streamlinesDone = true;
      }
      return true;
    }

    return false;
  }

  /**
   * All at once - will freeze if dsep small
   */
  createAllStreamlines(): void {
    this.streamlinesDone = false;

    let major = true;
    while (this.createStreamline(major)) {
      major = !major;
    }
    this.joinDanglingStreamlines();
  }

  protected simplifyStreamline(streamline: Vector[]): Vector[] {
    const simplified = [];
    for (const point of simplify(streamline, this.params.simplifyTolerance)) {
      simplified.push(new Vector(point.x, point.y));
    }
    return simplified;
  }

  /**
   * Finds seed and creates a streamline from that point
   * Pushes new candidate seeds to queue
   * @return {Vector[]} returns false if seed isn't found within params.seedTries
   */
  protected createStreamline(major: boolean): boolean {
    const seed = this.getSeed(major);
    if (seed === null) {
      return false;
    }
    const streamline = this.integrateStreamline(seed, major);
    if (this.validStreamline(streamline)) {
      this.grid(major).addPolyline(streamline);
      this.streamlines(major).push(streamline);
      this.allStreamlines.push(streamline);

      this.allStreamlinesSimple.push(this.simplifyStreamline(streamline));

      // Add candidate seeds
      if (!streamline[0].equals(streamline[streamline.length - 1])) {
        this.candidateSeeds(!major).push(streamline[0]);
        this.candidateSeeds(!major).push(streamline[streamline.length - 1]);
      }
    }

    return true;
  }

  public createStreamlineFromData(major: boolean, feature: any, originPoint: Vector) : void {
    let streamline: Vector[] = [];
    let seed;
    originPoint = this.latlongToMercator(originPoint.x, originPoint.y);
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
      streamline.push(seed);
    }

    this.grid(major).addPolyline(streamline);
    this.streamlines(major).push(streamline);
    this.allStreamlines.push(streamline);

    this.allStreamlinesSimple.push(this.simplifyStreamline(streamline));

      // Add candidate seeds
      if (!streamline[0].equals(streamline[streamline.length - 1])) {
        this.candidateSeeds(!major).push(streamline[0]);
        this.candidateSeeds(!major).push(streamline[streamline.length - 1]);
      }
  }

  protected validStreamline(s: Vector[]): boolean {
    return s.length > 5;
  }

  protected setParamsSq(): void {
    this.paramsSq = Object.assign({}, this.params);
    for (const p in this.paramsSq) {
      if (typeof this.paramsSq[p] === 'number') {
        this.paramsSq[p] *= this.paramsSq[p];
      }
    }
  }

  protected samplePoint(): Vector {
    // TODO better seeding scheme
    return new Vector(Math.random() * this.worldDimensions.x, Math.random() * this.worldDimensions.y).add(this.origin);
  }

  /**
   * Tries this.candidateSeeds first, then samples using this.samplePoint
   */
  protected getSeed(major: boolean): Vector | null {
    // Candidate seeds first
    if (this.SEED_AT_ENDPOINTS && this.candidateSeeds(major).length > 0) {
      while (this.candidateSeeds(major).length > 0) {
        const seed = this.candidateSeeds(major).pop();
        if (!seed) {
          return null;
        }
        if (this.isValidSample(major, seed, this.paramsSq.dsep)) {
          return seed;
        }
      }
    }

    let seed = this.samplePoint();
    let i = 0;
    while (!this.isValidSample(major, seed, this.paramsSq.dsep)) {
      if (i >= this.params.seedTries) {
        return null;
      }
      seed = this.samplePoint();
      i++;
    }

    return seed;
  }

  protected isValidSample(major: boolean, point: Vector, dSq: number, bothGrids = false): boolean {
    // dSq = dSq * point.distanceToSquared(Vector.zeroVector());
    let gridValid = this.grid(major).isValidSample(point, dSq);
    if (bothGrids) {
      gridValid = gridValid && this.grid(!major).isValidSample(point, dSq);
    }
    return this.integrator.onLand(point) && gridValid;
  }

  protected candidateSeeds(major: boolean): Vector[] {
    return major ? this.candidateSeedsMajor : this.candidateSeedsMinor;
  }

  protected streamlines(major: boolean): Vector[][] {
    return major ? this.streamlinesMajor : this.streamlinesMinor;
  }

  protected grid(major: boolean): GridStorage {
    return major ? this.majorGrid : this.minorGrid;
  }

  protected pointInBounds(v: Vector): boolean {
    return (
      v.x >= this.origin.x &&
      v.y >= this.origin.y &&
      v.x < this.worldDimensions.x + this.origin.x &&
      v.y < this.worldDimensions.y + this.origin.y
    );
  }

  /**
   * Didn't end up using - bit expensive, used streamlineTurned instead
   * Stops spirals from forming
   * uses 0.5 dcirclejoin so that circles are still joined up
   * testSample is candidate to pushed on end of streamlineForwards
   * returns true if streamline collides with itself
   */
  protected doesStreamlineCollideSelf(
    testSample: Vector,
    streamlineForwards: Vector[],
    streamlineBackwards: Vector[],
  ): boolean {
    // Streamline long enough
    if (streamlineForwards.length > this.nStreamlineLookBack) {
      // Forwards check
      for (let i = 0; i < streamlineForwards.length - this.nStreamlineLookBack; i += this.nStreamlineStep) {
        if (testSample.distanceToSquared(streamlineForwards[i]) < this.dcollideselfSq) {
          return true;
        }
      }

      // Backwards check
      for (let i = 0; i < streamlineBackwards.length; i += this.nStreamlineStep) {
        if (testSample.distanceToSquared(streamlineBackwards[i]) < this.dcollideselfSq) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Tests whether streamline has turned through greater than 180 degrees
   */
  protected streamlineTurned(seed: Vector, originalDir: Vector, point: Vector, direction: Vector): boolean {
    if (originalDir.dot(direction) < 0) {
      // TODO optimise
      const perpendicularVector = new Vector(originalDir.y, -originalDir.x);
      const isLeft = point.clone().sub(seed).dot(perpendicularVector) < 0;
      const directionUp = direction.dot(perpendicularVector) > 0;
      return isLeft === directionUp;
    }

    return false;
  }

  /**
   * // TODO this doesn't work well - consider something disallowing one direction (F/B) to turn more than 180 deg
   * One step of the streamline integration process
   */
  protected streamlineIntegrationStep(params: StreamlineIntegration, major: boolean, collideBoth: boolean): void {
    if (params.valid) {
      params.streamline.push(params.previousPoint);
      const nextDirection = this.integrator.integrate(params.previousPoint, major);

      // Stop at degenerate point
      if (nextDirection.lengthSq() < 0.01) {
        params.valid = false;
        return;
      }

      // Make sure we travel in the same direction
      if (nextDirection.dot(params.previousDirection) < 0) {
        nextDirection.negate();
      }

      const nextPoint = params.previousPoint.clone().add(nextDirection);

      // Visualise stopping points
      // if (this.streamlineTurned(params.seed, params.originalDir, nextPoint, nextDirection)) {
      //     params.valid = false;
      //     params.streamline.push(Vector.zeroVector());
      // }

      if (
        this.pointInBounds(nextPoint) &&
        this.isValidSample(major, nextPoint, this.paramsSq.dtest, collideBoth) &&
        !this.streamlineTurned(params.seed, params.originalDir, nextPoint, nextDirection)
      ) {
        params.previousPoint = nextPoint;
        params.previousDirection = nextDirection;
      } else {
        // One more step
        params.streamline.push(nextPoint);
        params.valid = false;
      }
    }
  }

  /**
   * By simultaneously integrating in both directions we reduce the impact of circles not joining
   * up as the error matches at the join
   */
  protected integrateStreamline(seed: Vector, major: boolean): Vector[] {
    let count = 0;
    let pointsEscaped = false; // True once two integration fronts have moved dlookahead away

    // Whether or not to test validity using both grid storages
    // (Collide with both major and minor)
    const collideBoth = Math.random() < this.params.collideEarly;

    const d = this.integrator.integrate(seed, major);

    const forwardParams: StreamlineIntegration = {
      seed: seed,
      originalDir: d,
      streamline: [seed],
      previousDirection: d,
      previousPoint: seed.clone().add(d),
      valid: true,
    };

    forwardParams.valid = this.pointInBounds(forwardParams.previousPoint);

    const negD = d.clone().negate();
    const backwardParams: StreamlineIntegration = {
      seed: seed,
      originalDir: negD,
      streamline: [],
      previousDirection: negD,
      previousPoint: seed.clone().add(negD),
      valid: true,
    };

    backwardParams.valid = this.pointInBounds(backwardParams.previousPoint);

    while (count < this.params.pathIterations && (forwardParams.valid || backwardParams.valid)) {
      this.streamlineIntegrationStep(forwardParams, major, collideBoth);
      this.streamlineIntegrationStep(backwardParams, major, collideBoth);

      // Join up circles
      const sqDistanceBetweenPoints = forwardParams.previousPoint.distanceToSquared(backwardParams.previousPoint);

      if (!pointsEscaped && sqDistanceBetweenPoints > this.paramsSq.dcirclejoin) {
        pointsEscaped = true;
      }

      if (pointsEscaped && sqDistanceBetweenPoints <= this.paramsSq.dcirclejoin) {
        forwardParams.streamline.push(forwardParams.previousPoint);
        forwardParams.streamline.push(backwardParams.previousPoint);
        backwardParams.streamline.push(backwardParams.previousPoint);
        break;
      }

      count++;
    }

    backwardParams.streamline.reverse().push(...forwardParams.streamline);
    return backwardParams.streamline;
  }

  public latlongToUTM(lat: number, long: number): Vector {
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

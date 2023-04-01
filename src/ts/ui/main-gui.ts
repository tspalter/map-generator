/**
 * Handles Map folder, glues together impl
 */
import { DomainController } from './domain-controller';
import { Vector } from '../impl/vector';
import { WaterGUI } from './water-gui';
import { RoadGUI } from './road-gui';
import { BuildingModel, Buildings } from './buildings';
import { WaterParams } from '../impl/water-generator';
import { StreamlineParams } from '../impl/streamlines';
import { TensorField } from '../impl/tensor-field';
import { RK4Integrator } from '../impl/integrator';
import Graph from '../impl/graph';
import { PolygonFinder } from '../impl/polygon-finder';
import PolygonUtil from '../impl/polygon-util';

export class MainGUI {
  private numBigParks = 2;
  private numSmallParks = 0;
  private clusterBigParks = false;

  private domainController = DomainController.getInstance();
  private intersections: Vector[] = [];
  private bigParks: Vector[][] = [];
  private smallParks: Vector[][] = [];
  private animate = true;
  private animationSpeed = 30;

  private coastline: WaterGUI;
  private mainRoads: RoadGUI;
  private majorRoads: RoadGUI;
  private minorRoads: RoadGUI;
  private buildings: Buildings;

  // Params
  private coastlineParams: WaterParams;
  private mainParams: StreamlineParams;
  private majorParams: StreamlineParams;
  private minorParams: StreamlineParams = {
    dsep: 20,
    dtest: 15,
    dstep: 1,
    dlookahead: 40,
    dcirclejoin: 5,
    joinangle: 0.1, // approx 30deg
    pathIterations: 1000,
    seedTries: 300,
    simplifyTolerance: 0.5,
    collideEarly: 0,
  };

  private redraw = true;

  constructor(private tensorField: TensorField, 
    minordsep: number,
    minordtest: number,
    minordstep: number,
    minordlookahead: number,
    minordcirclejoin: number,
    minorjoinangle: number,
    minorpathIterations: number,
    minorseedTries: number,
    minorsimplifyTolerance: number,
    minorcollideEarly: number,
    majordsep: number,
    majordtest: number,
    majordstep: number,
    majordlookahead: number,
    majordcirclejoin: number,
    majorjoinangle: number,
    majorpathIterations: number,
    majorseedTries: number,
    majorsimplifyTolerance: number,
    majorcollideEarly: number,
    maindsep: number,
    maindtest: number,
    maindstep: number,
    maindlookahead: number,
    maindcirclejoin: number,
    mainjoinangle: number,
    mainpathIterations: number,
    mainseedTries: number,
    mainsimplifyTolerance: number,
    maincollideEarly: number,
    coastdsep: number,
    coastdtest: number,
    coastdstep: number,
    coastdlookahead: number,
    coastdcirclejoin: number,
    coastjoinangle: number,
    coastpathIterations: number,
    coastseedTries: number,
    coastsimplifyTolerance: number,
    coastcollideEarly: number,
    coastnoiseEnabled: boolean,
    coastnoiseSize: number,
    coastnoiseAngle: number,
    rivernoiseEnabled: boolean,
    rivernoiseSize: number,
    rivernoiseAngle: number,
    clusterBigParks: boolean,
    numBigParks: number,
    numSmallParks: number,
    buildingminArea: number,
    buildingshrinkSpacing: number,
    buildingchanceNoDivide: number,
    private closeTensorFolder: () => void) {
      this.numBigParks = numBigParks;
      this.numSmallParks = numSmallParks;
      this.clusterBigParks = clusterBigParks;

      this.minorParams.dsep = minordsep;
      this.minorParams.dtest = minordtest;
      this.minorParams.dstep = minordstep;
      this.minorParams.dlookahead = minordlookahead;
      this.minorParams.dcirclejoin = minordcirclejoin;
      this.minorParams.joinangle = minorjoinangle;
      this.minorParams.pathIterations = minorpathIterations;
      this.minorParams.seedTries = minorseedTries;
      this.minorParams.simplifyTolerance = minorsimplifyTolerance;
      this.minorParams.collideEarly = minorcollideEarly;
      this.coastlineParams = Object.assign(
      {
        coastNoise: {
          noiseEnabled: coastnoiseEnabled,
          noiseSize: coastnoiseSize,
          noiseAngle: coastnoiseAngle,
        },
        riverNoise: {
          noiseEnabled: rivernoiseEnabled,
          noiseSize: rivernoiseSize,
          noiseAngle: rivernoiseAngle,
        },
        riverBankSize: 10,
        riverSize: 30,
      },
      this.minorParams,
    );
    this.coastlineParams.dsep = coastdsep;
    this.coastlineParams.dtest = coastdtest;
    this.coastlineParams.dstep = coastdstep;
    this.coastlineParams.dlookahead = coastdlookahead;
    this.coastlineParams.dcirclejoin = coastdcirclejoin;
    this.coastlineParams.joinangle = coastjoinangle;
    this.coastlineParams.pathIterations = coastpathIterations;
    this.coastlineParams.seedTries = coastseedTries;
    this.coastlineParams.simplifyTolerance = coastsimplifyTolerance;
    this.coastlineParams.collideEarly = coastcollideEarly;

    this.majorParams = Object.assign({}, this.minorParams);
    this.majorParams.dsep = majordsep;
    this.majorParams.dtest = majordtest;
    this.majorParams.dstep = majordstep;
    this.majorParams.dlookahead = majordlookahead;
    this.majorParams.dcirclejoin = majordcirclejoin;
    this.majorParams.joinangle = majorjoinangle;
    this.majorParams.pathIterations = majorpathIterations;
    this.majorParams.seedTries = majorseedTries;
    this.majorParams.simplifyTolerance = majorsimplifyTolerance;
    this.majorParams.collideEarly = majorcollideEarly;

    this.mainParams = Object.assign({}, this.minorParams);
    this.mainParams.dsep = maindsep;
    this.mainParams.dtest = maindtest;
    this.mainParams.dstep = maindstep;
    this.mainParams.dlookahead = maindlookahead;
    this.mainParams.dcirclejoin = maindcirclejoin;
    this.mainParams.joinangle = mainjoinangle;
    this.mainParams.pathIterations = mainpathIterations;
    this.mainParams.seedTries = mainseedTries;
    this.mainParams.simplifyTolerance = mainsimplifyTolerance;
    this.mainParams.collideEarly = maincollideEarly;

    const integrator = new RK4Integrator(tensorField, this.minorParams);
    const redraw = () => (this.redraw = true);

    this.coastline = new WaterGUI(
      tensorField,
      this.coastlineParams,
      integrator,
      closeTensorFolder,
      'Water',
      redraw,
    ).initFolder();
    this.mainRoads = new RoadGUI(this.mainParams, integrator, closeTensorFolder, 'Main', redraw).initFolder();
    this.majorRoads = new RoadGUI(
      this.majorParams,
      integrator,
      closeTensorFolder,
      'Major',
      redraw,
      this.animate,
    ).initFolder();
    this.minorRoads = new RoadGUI(
      this.minorParams,
      integrator,
      closeTensorFolder,
      'Minor',
      redraw,
      this.animate,
    ).initFolder();

    this.buildings = new Buildings(tensorField, redraw, this.minorParams.dstep, this.animate);
    this.buildings.buildingParams.minArea = buildingminArea;
    this.buildings.buildingParams.shrinkSpacing = buildingshrinkSpacing;
    this.buildings.buildingParams.chanceNoDivide = buildingchanceNoDivide;
    this.buildings.setPreGenerateCallback(() => {
      const allStreamlines = [];
      allStreamlines.push(...this.mainRoads.allStreamlines);
      allStreamlines.push(...this.majorRoads.allStreamlines);
      allStreamlines.push(...this.minorRoads.allStreamlines);
      allStreamlines.push(...this.coastline.streamlinesWithSecondaryRoad);
      this.buildings.setAllStreamlines(allStreamlines);
    });

    this.minorRoads.setExistingStreamlines([this.coastline, this.mainRoads, this.majorRoads]);
    this.majorRoads.setExistingStreamlines([this.coastline, this.mainRoads]);
    this.mainRoads.setExistingStreamlines([this.coastline]);

    this.coastline.setPreGenerateCallback(() => {
      this.mainRoads.clearStreamlines();
      this.majorRoads.clearStreamlines();
      this.minorRoads.clearStreamlines();
      this.bigParks = [];
      this.smallParks = [];
      this.buildings.reset();
      tensorField.parks = [];
      tensorField.seas = [];
      tensorField.river = [];
    });

    this.mainRoads.setPreGenerateCallback(() => {
      this.majorRoads.clearStreamlines();
      this.minorRoads.clearStreamlines();
      this.bigParks = [];
      this.smallParks = [];
      this.buildings.reset();
      tensorField.parks = [];
      tensorField.ignoreRiver = true;
    });

    this.mainRoads.setPostGenerateCallback(() => {
      tensorField.ignoreRiver = false;
    });

    this.majorRoads.setPreGenerateCallback(() => {
      this.minorRoads.clearStreamlines();
      this.bigParks = [];
      this.smallParks = [];
      this.buildings.reset();
      tensorField.parks = [];
      tensorField.ignoreRiver = true;
    });

    this.majorRoads.setPostGenerateCallback(() => {
      tensorField.ignoreRiver = false;
      this.addParks();
      this.redraw = true;
    });

    this.minorRoads.setPreGenerateCallback(() => {
      this.buildings.reset();
      this.smallParks = [];
      tensorField.parks = this.bigParks;
    });

    this.minorRoads.setPostGenerateCallback(() => {
      this.addParks();
    });
  }

  addParks(): void {
    const g = new Graph(
      this.majorRoads.allStreamlines.concat(this.mainRoads.allStreamlines).concat(this.minorRoads.allStreamlines),
      this.minorParams.dstep,
    );
    this.intersections = g.intersections;

    const p = new PolygonFinder(
      g.nodes,
      {
        maxLength: 20,
        minArea: 80,
        shrinkSpacing: 4,
        chanceNoDivide: 1,
      },
      this.tensorField,
    );
    p.findPolygons();
    const polygons = p.polygons;

    if (this.minorRoads.allStreamlines.length === 0) {
      // Big parks
      this.bigParks = [];
      this.smallParks = [];
      if (polygons.length > this.numBigParks) {
        if (this.clusterBigParks) {
          // Group in adjacent polygons
          const parkIndex = Math.floor(Math.random() * (polygons.length - this.numBigParks));
          for (let i = parkIndex; i < parkIndex + this.numBigParks; i++) {
            this.bigParks.push(polygons[i]);
          }
        } else {
          for (let i = 0; i < this.numBigParks; i++) {
            const parkIndex = Math.floor(Math.random() * polygons.length);
            this.bigParks.push(polygons[parkIndex]);
          }
        }
      } else {
        this.bigParks.push(...polygons);
      }
    } else {
      // Small parks
      this.smallParks = [];
      for (let i = 0; i < this.numSmallParks; i++) {
        const parkIndex = Math.floor(Math.random() * polygons.length);
        this.smallParks.push(polygons[parkIndex]);
      }
    }

    this.tensorField.parks = [];
    this.tensorField.parks.push(...this.bigParks);
    this.tensorField.parks.push(...this.smallParks);
  }

  generateEverything() {
    this.coastline.generateRoads();
    this.mainRoads.generateRoads();
    this.majorRoads.generateRoads();
    this.minorRoads.generateRoads();
    this.redraw = true;
    this.buildings.generate();
  }

  update() {
    let continueUpdate = true;
    const start = performance.now();
    while (continueUpdate && performance.now() - start < this.animationSpeed) {
      const minorChanged = this.minorRoads.update();
      const majorChanged = this.majorRoads.update();
      const mainChanged = this.mainRoads.update();
      const buildingsChanged = this.buildings.update();
      continueUpdate = minorChanged || majorChanged || mainChanged || buildingsChanged;
    }

    this.redraw = this.redraw || continueUpdate;
  }

  // draw(style: Style, forceDraw=false, customCanvas?: CanvasWrapper): void {
  //   if (!style.needsUpdate && !forceDraw && !this.redraw && !this.domainController.moved) {
  //     return;
  //   }
  //
  //   style.needsUpdate = false;
  //   this.domainController.moved = false;
  //   this.redraw = false;
  //
  //   style.seaPolygon = this.coastline.seaPolygon;
  //   style.coastline = this.coastline.coastline;
  //   style.river = this.coastline.river;
  //   style.lots = this.buildings.lots;
  //
  //   if (style instanceof DefaultStyle && style.showBuildingModels || style instanceof RoughStyle) {
  //     style.buildingModels = this.buildings.models;
  //   }
  //
  //   style.parks = [];
  //   style.parks.push(...this.bigParks.map(p => p.map(v => this.domainController.worldToScreen(v.clone()))));
  //   style.parks.push(...this.smallParks.map(p => p.map(v => this.domainController.worldToScreen(v.clone()))));
  //   style.minorRoads = this.minorRoads.roads;
  //   style.majorRoads = this.majorRoads.roads;
  //   style.mainRoads = this.mainRoads.roads;
  //   style.coastlineRoads = this.coastline.roads;
  //   style.secondaryRiver = this.coastline.secondaryRiver;
  //   style.draw(customCanvas);
  // }

  roadsEmpty(): boolean {
    return (
      this.majorRoads.roadsEmpty() &&
      this.minorRoads.roadsEmpty() &&
      this.mainRoads.roadsEmpty() &&
      this.coastline.roadsEmpty()
    );
  }

  // OBJ Export methods

  public get seaPolygons(): Vector[][] {
    return this.coastline.seaPolygons;
  }

  public get riverPolygons(): Vector[][] {
    return this.coastline.rivers;
  }

  public get buildingModels(): BuildingModel[] {
    return this.buildings.models;
  }

  public getBlocks(): Vector[][] {
    return this.buildings.getBlocks();
  }

  public get minorRoadPolygons(): Vector[][] {
    return this.minorRoads.roads.map((r) => PolygonUtil.resizeGeometry(r, 1 * this.domainController.zoom, false));
  }

  public get majorRoadPolygons(): Vector[][] {
    return this.majorRoads.roads
      .concat([this.coastline.secondaryRiver])
      .map((r) => PolygonUtil.resizeGeometry(r, 2 * this.domainController.zoom, false));
  }

  public get mainRoadPolygons(): Vector[][] {
    return this.mainRoads.roads
      .concat(this.coastline.roads)
      .map((r) => PolygonUtil.resizeGeometry(r, 2.5 * this.domainController.zoom, false));
  }

  public get coastlinePolygon(): Vector[] {
    return PolygonUtil.resizeGeometry(this.coastline.coastline, 15 * this.domainController.zoom, false);
  }
}

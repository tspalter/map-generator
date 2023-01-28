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

  constructor(private tensorField: TensorField, private closeTensorFolder: () => void) {
    this.coastlineParams = Object.assign(
      {
        coastNoise: {
          noiseEnabled: true,
          noiseSize: 30,
          noiseAngle: 20,
        },
        riverNoise: {
          noiseEnabled: true,
          noiseSize: 30,
          noiseAngle: 20,
        },
        riverBankSize: 10,
        riverSize: 30,
      },
      this.minorParams,
    );
    this.coastlineParams.pathIterations = 10000;
    this.coastlineParams.simplifyTolerance = 10;

    this.majorParams = Object.assign({}, this.minorParams);
    this.majorParams.dsep = 100;
    this.majorParams.dtest = 30;
    this.majorParams.dlookahead = 200;
    this.majorParams.collideEarly = 0;

    this.mainParams = Object.assign({}, this.minorParams);
    this.mainParams.dsep = 400;
    this.mainParams.dtest = 200;
    this.mainParams.dlookahead = 500;
    this.mainParams.collideEarly = 0;

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
      tensorField.sea = [];
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

  public get seaPolygon(): Vector[] {
    return this.coastline.seaPolygon;
  }

  public get riverPolygon(): Vector[] {
    return this.coastline.river;
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

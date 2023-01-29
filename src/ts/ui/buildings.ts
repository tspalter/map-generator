import Graph from '../impl/graph';
import { Vector } from '../impl/vector';
import { PolygonFinder } from '../impl/polygon-finder';
import { PolygonParams } from '../impl/polygon-finder';
import { DomainController } from './domain-controller';
import { TensorField } from '../impl/tensor-field';

export interface BuildingModel {
  height: number;
  lotWorld: Vector[]; // In world space
  lotScreen: Vector[]; // In screen space
  roof: Vector[]; // In screen space
  sides: Vector[][]; // In screen space
}

/**
 * Pseudo 3D buildings
 */
class BuildingModels {
  private domainController = DomainController.getInstance();
  private _buildingModels: BuildingModel[] = [];

  constructor(lots: Vector[][]) {
    // Lots in world space
    for (const lot of lots) {
      this._buildingModels.push({
        height: Math.random() * 20 + 20,
        lotWorld: lot,
        lotScreen: [],
        roof: [],
        sides: [],
      });
    }
    this._buildingModels.sort((a, b) => a.height - b.height);
  }

  get buildingModels(): BuildingModel[] {
    return this._buildingModels;
  }

  /**
   * Get sides of buildings by joining corresponding edges between the roof and ground
   */
  setBuildingProjections(): void {
    const d = 1000 / this.domainController.zoom;
    const cameraPos = this.domainController.getCameraPosition();
    for (const b of this._buildingModels) {
      b.lotScreen = b.lotWorld.map((v) => this.domainController.worldToScreen(v.clone()));
      b.roof = b.lotScreen.map((v) => this.heightVectorToScreen(v, b.height, d, cameraPos));
      b.sides = this.getBuildingSides(b);
    }
  }

  private heightVectorToScreen(v: Vector, h: number, d: number, camera: Vector): Vector {
    const scale = d / (d - h); // 0.1
    if (this.domainController.orthographic) {
      const diff = this.domainController.cameraDirection.multiplyScalar(-h * scale);
      return v.clone().add(diff);
    } else {
      return v.clone().sub(camera).multiplyScalar(scale).add(camera);
    }
  }

  /**
   * Get sides of buildings by joining corresponding edges between the roof and ground
   */
  private getBuildingSides(b: BuildingModel): Vector[][] {
    const polygons: Vector[][] = [];
    for (let i = 0; i < b.lotScreen.length; i++) {
      const next = (i + 1) % b.lotScreen.length;
      polygons.push([b.lotScreen[i], b.lotScreen[next], b.roof[next], b.roof[i]]);
    }
    return polygons;
  }
}

/**
 * Finds building lots and optionally pseudo3D buildings
 */
export class Buildings {
  private polygonFinder: PolygonFinder;
  private allStreamlines: Vector[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private preGenerateCallback: () => any = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private postGenerateCallback: () => any = () => {};
  private _models: BuildingModels = new BuildingModels([]);
  private _blocks: Vector[][] = [];

  private buildingParams: PolygonParams = {
    maxLength: 20,
    minArea: 50,
    shrinkSpacing: 4,
    chanceNoDivide: 0.05,
  };

  constructor(
    private tensorField: TensorField,
    private redraw: () => void,
    private dstep: number,
    private _animate: boolean,
  ) {
    this.polygonFinder = new PolygonFinder([], this.buildingParams, this.tensorField);
  }

  set animate(v: boolean) {
    this._animate = v;
  }

  /**
   * Only used when creating the 3D model to 'fake' the roads
   */
  getBlocks(): Vector[][] {
    const g = new Graph(this.allStreamlines, this.dstep, true);
    const blockParams = Object.assign({}, this.buildingParams);
    blockParams.shrinkSpacing = blockParams.shrinkSpacing / 2;
    const polygonFinder = new PolygonFinder(g.nodes, blockParams, this.tensorField);
    polygonFinder.findPolygons();
    polygonFinder.shrink();
    return polygonFinder.polygons.map((p) => p.map((v) => v));
  }

  get models(): BuildingModel[] {
    this._models.setBuildingProjections();
    return this._models.buildingModels;
  }

  setAllStreamlines(s: Vector[][]): void {
    this.allStreamlines = s;
  }

  reset(): void {
    this.polygonFinder.reset();
    this._models = new BuildingModels([]);
  }

  update(): boolean {
    return this.polygonFinder.update();
  }

  /**
   * Finds blocks, shrinks and divides them to create building lots
   */
  generate(): void {
    this.preGenerateCallback();
    this._models = new BuildingModels([]);
    const g = new Graph(this.allStreamlines, this.dstep, true);

    this.polygonFinder = new PolygonFinder(g.nodes, this.buildingParams, this.tensorField);
    this.polygonFinder.findPolygons();
    this.polygonFinder.shrink();
    this.polygonFinder.divide();
    this.redraw();
    this._models = new BuildingModels(this.polygonFinder.polygons);

    this.postGenerateCallback();
  }

  setPreGenerateCallback(callback: () => any): void {
    this.preGenerateCallback = callback;
  }

  setPostGenerateCallback(callback: () => any): void {
    this.postGenerateCallback = callback;
  }
}

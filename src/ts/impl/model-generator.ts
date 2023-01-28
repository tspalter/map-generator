import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import { Vector } from './vector';
import { BuildingModel } from '../ui/buildings';
import JSZip from 'jszip';
import { createWriteStream } from 'fs';

enum ModelGeneratorStates {
  WAITING,
  SUBTRACT_OCEAN,
  ADD_COASTLINE,
  SUBTRACT_RIVER,
  ADD_ROADS,
  ADD_BLOCKS,
  ADD_BUILDINGS,
  CREATE_ZIP,
}

export class ModelGenerator {
  private readonly groundLevel = 20; // Thickness of groundMesh

  private readonly exportSTL = require('threejs-export-stl');
  // eslint-disable-next-line @typescript-eslint/no-empty-function,@typescript-eslint/no-unused-vars
  private resolve: (blob: any) => void = (b) => {};
  private zip: JSZip = new JSZip();
  private state: ModelGeneratorStates = ModelGeneratorStates.WAITING;

  private groundMesh: THREE.Mesh | null = null;
  private groundBsp: CSG | null = null;
  private polygonsToProcess: Vector[][] = [];
  private roadsGeometry = new THREE.Geometry();
  private blocksGeometry = new THREE.Geometry();
  private roadsBsp: CSG | null = null;
  private buildingsGeometry = new THREE.Geometry();
  private buildingsToProcess: BuildingModel[] = [];

  constructor(
    private ground: Vector[],
    private sea: Vector[],
    private coastline: Vector[],
    private river: Vector[],
    private mainRoads: Vector[][],
    private majorRoads: Vector[][],
    private minorRoads: Vector[][],
    private buildings: BuildingModel[],
    private blocks: Vector[][],
  ) {}

  public getSTL(fileName: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.zip.file(
        'model/README.txt',
        'For a tutorial on putting these models together to create a city, go to https://maps.probabletrain.com/#/stl',
      );

      this.groundMesh = this.polygonToMesh(this.ground, this.groundLevel);
      this.groundBsp = CSG.fromMesh(this.groundMesh);
      this.setState(ModelGeneratorStates.SUBTRACT_OCEAN);

      this.subtractOcean();
      this.addCoastline();
      this.subtractRiver();
      this.addRoads();
      this.addBlocks();
      this.addBuildings();
      this.createZip(fileName).then(() => resolve());
    });
  }

  private setState(s: ModelGeneratorStates): void {
    this.state = s;
  }

  private subtractOcean(): void {
    const seaLevelMesh = this.polygonToMesh(this.ground, 0);
    this.threeToBlender(seaLevelMesh);
    const seaLevelSTL = this.exportSTL.fromMesh(seaLevelMesh);
    this.zip.file('model/domain.stl', seaLevelSTL);

    const seaMesh = this.polygonToMesh(this.sea, 0);
    this.threeToBlender(seaMesh);
    const seaMeshSTL = this.exportSTL.fromMesh(seaMesh);
    this.zip.file('model/sea.stl', seaMeshSTL);
    this.setState(ModelGeneratorStates.ADD_COASTLINE);
  }

  private addCoastline(): void {
    const coastlineMesh = this.polygonToMesh(this.coastline, 0);
    this.threeToBlender(coastlineMesh);
    const coastlineSTL = this.exportSTL.fromMesh(coastlineMesh);
    this.zip.file('model/coastline.stl', coastlineSTL);
    this.setState(ModelGeneratorStates.SUBTRACT_RIVER);
  }

  private subtractRiver(): void {
    const riverMesh = this.polygonToMesh(this.river, 0);
    this.threeToBlender(riverMesh);
    const riverSTL = this.exportSTL.fromMesh(riverMesh);
    this.zip.file('model/river.stl', riverSTL);
    this.setState(ModelGeneratorStates.ADD_ROADS);
    this.polygonsToProcess = this.minorRoads.concat(this.majorRoads).concat(this.mainRoads);
  }

  private addRoads(): void {
    if (this.polygonsToProcess.length === 0) {
      const mesh = new THREE.Mesh(this.roadsGeometry);
      this.threeToBlender(mesh);
      const buildingsSTL = this.exportSTL.fromMesh(mesh);
      this.zip.file('model/roads.stl', buildingsSTL);

      this.setState(ModelGeneratorStates.ADD_BLOCKS);
      this.polygonsToProcess = [...this.blocks];
      return;
    }

    const road = this.polygonsToProcess.pop();
    if (!road) {
      return;
    }
    const roadsMesh = this.polygonToMesh(road, 0);
    if (!this.groundMesh) {
      throw new Error('this.groundMesh is null');
    }
    this.roadsGeometry.merge(roadsMesh.geometry as THREE.Geometry, this.groundMesh.matrix);
  }

  private addBlocks(): void {
    if (this.polygonsToProcess.length === 0) {
      const mesh = new THREE.Mesh(this.blocksGeometry);
      this.threeToBlender(mesh);
      const blocksSTL = this.exportSTL.fromMesh(mesh);
      this.zip.file('model/blocks.stl', blocksSTL);

      this.setState(ModelGeneratorStates.ADD_BUILDINGS);
      this.buildingsToProcess = [...this.buildings];
      return;
    }

    const block = this.polygonsToProcess.pop();
    if (!block) {
      return;
    }
    const blockMesh = this.polygonToMesh(block, 1);
    if (!this.groundMesh) {
      throw new Error('this.groundMesh is null');
    }
    this.blocksGeometry.merge(blockMesh.geometry as THREE.Geometry, this.groundMesh.matrix);
  }

  private addBuildings(): void {
    if (this.buildingsToProcess.length === 0) {
      const mesh = new THREE.Mesh(this.buildingsGeometry);
      this.threeToBlender(mesh);
      const buildingsSTL = this.exportSTL.fromMesh(mesh);
      this.zip.file('model/buildings.stl', buildingsSTL);
      this.setState(ModelGeneratorStates.CREATE_ZIP);
      return;
    }

    const b = this.buildingsToProcess.pop();
    if (!b) {
      return;
    }
    const buildingMesh = this.polygonToMesh(b.lotScreen, b.height);
    if (!this.groundMesh) {
      throw new Error('this.groundMesh is null');
    }
    this.buildingsGeometry.merge(buildingMesh.geometry as THREE.Geometry, this.groundMesh.matrix);
  }

  private async createZip(fileName: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.zip
        .generateNodeStream({ streamFiles: true })
        .pipe(createWriteStream(fileName))
        .on('finish', () => {
          resolve();
        });
    });
    // return new Promise<any>((resolve) => {
    //   this.zip.generateNodeStream();
    //   this.zip.generateAsync({ type: 'blob' }).then((blob) => {
    //     this.setState(ModelGeneratorStates.WAITING);
    //     resolve(blob);
    //   });
    // });
  }

  /**
   * Return true if processing a model
   * Work done in update loop so main thread isn't swamped
   */
  // public update(): boolean {
  //   switch (this.state) {
  //     case ModelGeneratorStates.WAITING: {
  //       return false;
  //     }
  //     case ModelGeneratorStates.SUBTRACT_OCEAN: {
  //       const seaLevelMesh = this.polygonToMesh(this.ground, 0);
  //       this.threeToBlender(seaLevelMesh);
  //       const seaLevelSTL = this.exportSTL.fromMesh(seaLevelMesh);
  //       this.zip.file('model/domain.stl', seaLevelSTL);
  //
  //       const seaMesh = this.polygonToMesh(this.sea, 0);
  //       this.threeToBlender(seaMesh);
  //       const seaMeshSTL = this.exportSTL.fromMesh(seaMesh);
  //       this.zip.file('model/sea.stl', seaMeshSTL);
  //       this.setState(ModelGeneratorStates.ADD_COASTLINE);
  //       break;
  //     }
  //     case ModelGeneratorStates.ADD_COASTLINE: {
  //       const coastlineMesh = this.polygonToMesh(this.coastline, 0);
  //       this.threeToBlender(coastlineMesh);
  //       const coastlineSTL = this.exportSTL.fromMesh(coastlineMesh);
  //       this.zip.file('model/coastline.stl', coastlineSTL);
  //       this.setState(ModelGeneratorStates.SUBTRACT_RIVER);
  //       break;
  //     }
  //     case ModelGeneratorStates.SUBTRACT_RIVER: {
  //       const riverMesh = this.polygonToMesh(this.river, 0);
  //       this.threeToBlender(riverMesh);
  //       const riverSTL = this.exportSTL.fromMesh(riverMesh);
  //       this.zip.file('model/river.stl', riverSTL);
  //       this.setState(ModelGeneratorStates.ADD_ROADS);
  //       this.polygonsToProcess = this.minorRoads.concat(this.majorRoads).concat(this.mainRoads);
  //       break;
  //     }
  //     case ModelGeneratorStates.ADD_ROADS: {
  //       if (this.polygonsToProcess.length === 0) {
  //         const mesh = new THREE.Mesh(this.roadsGeometry);
  //         this.threeToBlender(mesh);
  //         const buildingsSTL = this.exportSTL.fromMesh(mesh);
  //         this.zip.file('model/roads.stl', buildingsSTL);
  //
  //         this.setState(ModelGeneratorStates.ADD_BLOCKS);
  //         this.polygonsToProcess = [...this.blocks];
  //         break;
  //       }
  //
  //       const road = this.polygonsToProcess.pop();
  //       if (!road) {
  //         break;
  //       }
  //       const roadsMesh = this.polygonToMesh(road, 0);
  //       if (!this.groundMesh) {
  //         throw new Error('this.groundMesh is null');
  //       }
  //       this.roadsGeometry.merge(roadsMesh.geometry as THREE.Geometry, this.groundMesh.matrix);
  //       break;
  //     }
  //     case ModelGeneratorStates.ADD_BLOCKS: {
  //       if (this.polygonsToProcess.length === 0) {
  //         const mesh = new THREE.Mesh(this.blocksGeometry);
  //         this.threeToBlender(mesh);
  //         const blocksSTL = this.exportSTL.fromMesh(mesh);
  //         this.zip.file('model/blocks.stl', blocksSTL);
  //
  //         this.setState(ModelGeneratorStates.ADD_BUILDINGS);
  //         this.buildingsToProcess = [...this.buildings];
  //         break;
  //       }
  //
  //       const block = this.polygonsToProcess.pop();
  //       if (!block) {
  //         break;
  //       }
  //       const blockMesh = this.polygonToMesh(block, 1);
  //       if (!this.groundMesh) {
  //         throw new Error('this.groundMesh is null');
  //       }
  //       this.blocksGeometry.merge(blockMesh.geometry as THREE.Geometry, this.groundMesh.matrix);
  //       break;
  //     }
  //     case ModelGeneratorStates.ADD_BUILDINGS: {
  //       if (this.buildingsToProcess.length === 0) {
  //         const mesh = new THREE.Mesh(this.buildingsGeometry);
  //         this.threeToBlender(mesh);
  //         const buildingsSTL = this.exportSTL.fromMesh(mesh);
  //         this.zip.file('model/buildings.stl', buildingsSTL);
  //         this.setState(ModelGeneratorStates.CREATE_ZIP);
  //         break;
  //       }
  //
  //       const b = this.buildingsToProcess.pop();
  //       if (!b) {
  //         break;
  //       }
  //       const buildingMesh = this.polygonToMesh(b.lotScreen, b.height);
  //       if (!this.groundMesh) {
  //         throw new Error('this.groundMesh is null');
  //       }
  //       this.buildingsGeometry.merge(buildingMesh.geometry as THREE.Geometry, this.groundMesh.matrix);
  //       break;
  //     }
  //     case ModelGeneratorStates.CREATE_ZIP: {
  //       this.zip.generateAsync({ type: 'blob' }).then((blob: any) => this.resolve(blob));
  //       this.setState(ModelGeneratorStates.WAITING);
  //       break;
  //     }
  //     default: {
  //       break;
  //     }
  //   }
  //   return true;
  // }

  /**
   * Rotate and scale mesh so up is in the right direction
   */
  private threeToBlender(mesh: THREE.Object3D): void {
    mesh.scale.multiplyScalar(0.02);
    mesh.updateMatrixWorld(true);
  }

  /**
   * Extrude a polygon into a THREE.js mesh
   */
  private polygonToMesh(polygon: Vector[], height: number): THREE.Mesh {
    if (polygon.length < 3) {
      throw new Error('polygon.length < 3');
    }
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      shape.lineTo(polygon[i].x, polygon[i].y);
    }
    shape.lineTo(polygon[0].x, polygon[0].y);

    if (height === 0) {
      return new THREE.Mesh(new THREE.ShapeGeometry(shape));
    }

    const extrudeSettings = {
      steps: 1,
      depth: height,
      bevelEnabled: false,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const mesh = new THREE.Mesh(geometry);
    // mesh.translateZ(-height);
    mesh.updateMatrixWorld(true);
    return mesh;
  }
}

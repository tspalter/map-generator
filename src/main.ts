import { DomainController } from './ts/ui/domain-controller';
import { DragController } from './ts/ui/drag-controller';
import TensorFieldGUI from './ts/ui/tensor-field-gui';
import { MainGUI } from './ts/ui/main-gui';
import { ModelGenerator } from './ts/impl/model-generator';
import { NoiseParams } from './ts/impl/tensor-field';
import { Util } from './ts/impl/util';
import { Vector } from './ts/impl/vector';
import { saveAs } from 'file-saver';
import { BasisField, Grid, Radial } from './ts/impl/basis-field';

export class Main {
  private readonly STARTING_WIDTH = 1440; // Initially zooms in if width > STARTING_WIDTH

  // UI
  private domainController = DomainController.getInstance();
  private dragController = new DragController();
  private tensorField: TensorFieldGUI;
  private mainGui: MainGUI; // In charge of glueing everything together

  // Options
  private imageScale = 3; // Multiplier for res of downloaded image
  public highDPI = false; // Increases resolution for hiDPI displays

  // Style options
  private colourScheme = 'Default'; // See colour_schemes.json
  private zoomBuildings = false; // Show buildings only when zoomed in?
  private buildingModels = false; // Draw pseudo-3D buildings?
  private showFrame = false;

  // Force redraw of roads when switching from tensor vis to map vis
  private previousFrameDrawTensor = true;

  // 3D camera position
  private cameraX = 0;
  private cameraY = 0;

  private firstGenerate = true; // Don't randomise tensor field on first generate

  // grids/radial
  private g0: Grid;
  private g1: Grid;
  private g2: Grid;
  private g3: Grid;
  private r: Radial;

  constructor(minordsep: number, 
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
    grid0X: number,
    grid0Y: number,
    grid0size: number,
    grid0decay: number,
    grid0theta: number,
    grid1X: number,
    grid1Y: number,
    grid1size: number,
    grid1decay: number,
    grid1theta: number,
    grid2X: number,
    grid2Y: number,
    grid2size: number,
    grid2decay: number,
    grid2theta: number,
    grid3X: number,
    grid3Y: number,
    grid3size: number,
    grid3decay: number,
    grid3theta: number,
    radialX: number,
    radialY: number,
    radialsize: number,
    radialdecay: number) {
    // Make sure we're not too zoomed out for large resolutions
    const screenWidth = this.domainController.screenDimensions.x;
    if (screenWidth > this.STARTING_WIDTH) {
      this.domainController.zoom = screenWidth / this.STARTING_WIDTH;
    }

    const noiseParamsPlaceholder: NoiseParams = {
      // Placeholder values for park + water noise
      globalNoise: false,
      noiseSizePark: 20,
      noiseAnglePark: 90,
      noiseSizeGlobal: 30,
      noiseAngleGlobal: 20,
    };

    this.tensorField = new TensorFieldGUI(this.dragController, true, noiseParamsPlaceholder);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.mainGui = new MainGUI(this.tensorField, 
      minordsep, 
      minordtest,
      minordstep,
      minordlookahead,
      minordcirclejoin,
      minorjoinangle,
      minorpathIterations,
      minorseedTries,
      minorsimplifyTolerance,
      minorcollideEarly,
      majordsep,
      majordtest,
      majordstep,
      majordlookahead,
      majordcirclejoin,
      majorjoinangle,
      majorpathIterations,
      majorseedTries,
      majorsimplifyTolerance,
      majorcollideEarly,
      maindsep,
      maindtest,
      maindstep,
      maindlookahead,
      maindcirclejoin,
      mainjoinangle,
      mainpathIterations,
      mainseedTries,
      mainsimplifyTolerance,
      maincollideEarly,
      coastdsep,
      coastdtest,
      coastdstep,
      coastdlookahead,
      coastdcirclejoin,
      coastjoinangle,
      coastpathIterations,
      coastseedTries,
      coastsimplifyTolerance,
      coastcollideEarly,
      coastnoiseEnabled,
      coastnoiseSize,
      coastnoiseAngle,
      rivernoiseEnabled,
      rivernoiseSize,
      rivernoiseAngle,
      clusterBigParks,
      numBigParks,
      numSmallParks,
      buildingminArea,
      buildingshrinkSpacing,
      buildingchanceNoDivide,
      () => {});

    this.tensorField.setRecommended();
    this.g0 = new Grid(new Vector(grid0X, grid0Y), grid0size, grid0decay, grid0theta);
    this.g1 = new Grid(new Vector(grid1X, grid1Y), grid1size, grid1decay, grid1theta);
    this.g2 = new Grid(new Vector(grid2X, grid2Y), grid2size, grid2decay, grid2theta);
    this.g3 = new Grid(new Vector(grid3X, grid3Y), grid3size, grid3decay, grid3theta);
    this.r = new Radial(new Vector(radialX, radialY), radialsize, radialdecay);

    this.tensorField.basisFields[0] = this.g0;
    this.tensorField.basisFields[1] = this.g1;
    this.tensorField.basisFields[2] = this.g2;
    this.tensorField.basisFields[3] = this.g3;
    this.tensorField.basisFields[4] = this.r;

  }

  doItAll(fileName: string): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        this.generate();
      }
      catch(err) {
        console.log(err);
        resolve();
      }
      this.downloadSTL(fileName).then(() => resolve());
    });
  }

  /**
   * Generate an entire map with no control over the process
   */
  generate(): void {
    if (!this.firstGenerate) {
      this.tensorField.setRecommended();
    } else {
      this.firstGenerate = false;
    }

    this.mainGui.generateEverything();
  }

  /**
   * @param {string} scheme Matches a scheme name in colour_schemes.json
   */
  // changeColourScheme(scheme: string): void {
  //   const colourScheme: ColourScheme = (ColourSchemes as any)[scheme];
  //   this.zoomBuildings = colourScheme.zoomBuildings;
  //   this.buildingModels = colourScheme.buildingModels;
  //   Util.updateGui(this.styleFolder);
  //   if (scheme.startsWith("Drawn")) {
  //     this._style = new RoughStyle(this.canvas, this.dragController, Object.assign({}, colourScheme));
  //   } else {
  //     this._style = new DefaultStyle(this.canvas, this.dragController, Object.assign({}, colourScheme), scheme.startsWith("Heightmap"));
  //   }
  //   this._style.showFrame = this.showFrame;
  //   this.changeCanvasScale(this.highDPI);
  // }

  /**
   * Scale up canvas resolution for hiDPI displays
   */
  // changeCanvasScale(high: boolean): void {
  //   const value = high ? 2 : 1;
  //   this._style.canvasScale = value;
  //   this.tensorCanvas.canvasScale = value;
  // }

  /**
   * Change camera position for pseudo3D buildings
   */
  // setCameraDirection(): void {
  //   this.domainController.cameraDirection = new Vector(this.cameraX / 10, this.cameraY / 10);
  // }

  downloadSTL(fileName: string): Promise<void> {
    return new Promise<void>((resolve) => {
      // All in screen space
      const extendScreenX = this.domainController.screenDimensions.x * ((Util.DRAW_INFLATE_AMOUNT - 1) / 2);
      const extendScreenY = this.domainController.screenDimensions.y * ((Util.DRAW_INFLATE_AMOUNT - 1) / 2);
      const ground: Vector[] = [
        new Vector(-extendScreenX, -extendScreenY),
        new Vector(-extendScreenX, this.domainController.screenDimensions.y + extendScreenY),
        new Vector(
          this.domainController.screenDimensions.x + extendScreenX,
          this.domainController.screenDimensions.y + extendScreenY,
        ),
        new Vector(this.domainController.screenDimensions.x + extendScreenX, -extendScreenY),
      ];

      const blocks = this.mainGui.getBlocks();
      const modelGenerator = new ModelGenerator(
        ground,
        this.mainGui.seaPolygons,
        this.mainGui.coastlinePolygon,
        this.mainGui.riverPolygons,
        this.mainGui.mainRoadPolygons,
        this.mainGui.majorRoadPolygons,
        this.mainGui.minorRoadPolygons,
        this.mainGui.buildingModels,
        blocks,
      );
      modelGenerator.getSTL(fileName).then(() => resolve());
    });
  }

  private downloadFile(filename: string, file: any): void {
    saveAs(file, filename);
  }

  /**
   * Downloads image of map
   * Draws onto hidden canvas at requested resolution
   */
  // downloadPng(): void {
  //   const c = document.getElementById(Util.IMG_CANVAS_ID) as HTMLCanvasElement;
  //
  //   // Draw
  //   if (this.showTensorField()) {
  //     this.tensorField.draw(new DefaultCanvasWrapper(c, this.imageScale, false));
  //   } else {
  //     const imgCanvas = this._style.createCanvasWrapper(c, this.imageScale, false);
  //     this.mainGui.draw(this._style, true, imgCanvas);
  //   }
  //
  //   const link = document.createElement('a');
  //   link.download = 'map.png';
  //   link.href = (document.getElementById(Util.IMG_CANVAS_ID) as any).toDataURL();
  //   link.click();
  // }

  /**
   * Same as downloadPng but uses Heightmap style
   */
  // downloadHeightmap(): void {
  //   const oldColourScheme = this.colourScheme;
  //   this.changeColourScheme("Heightmap");
  //   this.downloadPng();
  //   this.changeColourScheme(oldColourScheme);
  // }

  /**
   * Downloads svg of map
   * Draws onto hidden svg at requested resolution
   */
  // downloadSVG(): void {
  //   const c = document.getElementById(Util.IMG_CANVAS_ID) as HTMLCanvasElement;
  //   const svgElement = document.getElementById(Util.SVG_ID);
  //
  //   if (this.showTensorField()) {
  //     const imgCanvas = new DefaultCanvasWrapper(c, 1, false);
  //     imgCanvas.createSVG(svgElement);
  //     this.tensorField.draw(imgCanvas);
  //   } else {
  //     const imgCanvas = this._style.createCanvasWrapper(c, 1, false);
  //     imgCanvas.createSVG(svgElement);
  //     this.mainGui.draw(this._style, true, imgCanvas);
  //   }
  //
  //   const serializer = new XMLSerializer();
  //   let source = serializer.serializeToString(svgElement);
  //   //add name spaces.
  //   if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
  //     source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  //   }
  //   if(!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)){
  //     source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  //   }
  //
  //   //add xml declaration
  //   source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
  //
  //   //convert svg source to URI data scheme.
  //   const url = "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(source);
  //
  //   const link = document.createElement('a');
  //   link.download = 'map.svg';
  //   link.href = url;
  //   link.click();
  //
  //   // Clear SVG
  //   const element = SVG(svgElement);
  //   element.clear();
  // }

  // private showTensorField(): boolean {
  //   return !this.tensorFolder.closed || this.mainGui.roadsEmpty();
  // }

  // draw(): void {
  //   if (this.showTensorField()) {
  //     this.previousFrameDrawTensor = true;
  //     this.dragController.setDragDisabled(false);
  //     this.tensorField.draw(this.tensorCanvas);
  //   } else {
  //     // Disable field drag and drop
  //     this.dragController.setDragDisabled(true);
  //
  //     if (this.previousFrameDrawTensor === true) {
  //       this.previousFrameDrawTensor = false;
  //
  //       // Force redraw if switching from tensor field
  //       this.mainGui.draw(this._style, true);
  //     } else {
  //       this.mainGui.draw(this._style);
  //     }
  //   }
  // }

  // update(): void {
  //   if (this.modelGenerator) {
  //     let continueUpdate = true;
  //     const start = performance.now();
  //     while (continueUpdate && performance.now() - start < 100) {
  //       continueUpdate = this.modelGenerator.update();
  //     }
  //   }
  //
  //   this._style.update();
  //   this.mainGui.update();
  //   this.draw();
  //   requestAnimationFrame(this.update.bind(this));
  // }
}

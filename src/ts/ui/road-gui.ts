import { FieldIntegrator } from '../impl/integrator';
import { StreamlineGenerator, StreamlineParams } from '../impl/streamlines';
import { Vector } from '../impl/vector';
import { DomainController } from './domain-controller';
import { Util } from '../impl/util';

/**
 * Handles creation of roads
 */
export class RoadGUI {
  protected streamlines: StreamlineGenerator;
  private existingStreamlines: RoadGUI[] = [];
  protected domainController = DomainController.getInstance();

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected preGenerateCallback: () => any = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected postGenerateCallback: () => any = () => {};

  private streamlinesInProgress = false;

  constructor(
    protected params: StreamlineParams,
    protected integrator: FieldIntegrator,
    protected closeTensorFolder: () => void,
    protected folderName: string,
    protected redraw: () => void,
    protected _animate = false,
  ) {
    this.streamlines = new StreamlineGenerator(
      this.integrator,
      this.domainController.origin,
      this.domainController.worldDimensions,
      this.params,
    );

    // Update path iterations based on window size
    this.setPathIterations();
  }

  initFolder(): RoadGUI {
    return this;
  }

  set animate(b: boolean) {
    this._animate = b;
  }

  get allStreamlines(): Vector[][] {
    return this.streamlines.allStreamlinesSimple;
  }

  get roads(): Vector[][] {
    // For drawing not generation, probably fine to leave map
    return this.streamlines.allStreamlinesSimple.map((s) =>
      s.map((v) => this.domainController.worldToScreen(v.clone())),
    );
  }

  roadsEmpty(): boolean {
    return this.streamlines.allStreamlinesSimple.length === 0;
  }

  setExistingStreamlines(existingStreamlines: RoadGUI[]): void {
    this.existingStreamlines = existingStreamlines;
  }

  setPreGenerateCallback(callback: () => any) {
    this.preGenerateCallback = callback;
  }

  setPostGenerateCallback(callback: () => any) {
    this.postGenerateCallback = callback;
  }

  clearStreamlines(): void {
    this.streamlines.clearStreamlines();
  }

  generateRoads(): void {
    this.preGenerateCallback();

    this.streamlines = new StreamlineGenerator(
      this.integrator,
      this.domainController.origin,
      this.domainController.worldDimensions,
      Object.assign({}, this.params),
    );
    this.domainController.zoom = this.domainController.zoom * Util.DRAW_INFLATE_AMOUNT;

    for (const s of this.existingStreamlines) {
      this.streamlines.addExistingStreamlines(s.streamlines);
    }

    this.closeTensorFolder();
    this.redraw();

    this.streamlines.createAllStreamlines();
    this.postGenerateCallback();
  }

  /**
   * Returns true if streamlines changes
   */
  update(): boolean {
    return this.streamlines.update();
  }

  /**
   * Sets path iterations so that a road can cover the screen
   */
  private setPathIterations(): void {
    const max = 1.5 * Math.max(1280, 1024);
    this.params.pathIterations = max / this.params.dstep;
  }
}

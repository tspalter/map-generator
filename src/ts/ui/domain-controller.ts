/**
 * Singleton
 * Controls panning and zooming
 */
import { Vector } from '../impl/vector';

export class DomainController {
  private static instance: DomainController;

  private readonly ZOOM_SPEED = 0.96;
  private readonly SCROLL_DELAY = 100;

  // Location of screen origin in world space
  private _origin: Vector = Vector.zeroVector();

  // Screen-space width and height
  private _screenDimensions = Vector.zeroVector();

  // Ratio of screen pixels to world pixels
  private _zoom = 1;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private zoomCallback: () => any = () => {};
  private lastScrolltime = -this.SCROLL_DELAY;
  private refreshedAfterScroll = false;

  private _cameraDirection = Vector.zeroVector();
  private _orthographic = false;

  // Set after pan or zoom
  public moved = false;

  private constructor() {
    this.setScreenDimensions();
  }

  /**
   * Used to stop drawing buildings while scrolling for certain styles
   * to keep the framerate up
   */
  get isScrolling(): boolean {
    return Date.now() - this.lastScrolltime < this.SCROLL_DELAY;
  }

  private setScreenDimensions(): void {
    this.moved = true;
    this._screenDimensions.setX(1536);
    this._screenDimensions.setY(746);
  }

  public static getInstance(): DomainController {
    if (!DomainController.instance) {
      DomainController.instance = new DomainController();
    }
    return DomainController.instance;
  }

  /**
   * @param {Vector} delta in world space
   */
  pan(delta: Vector) {
    this.moved = true;
    this._origin.sub(delta);
  }

  /**
   * Screen origin in world space
   */
  get origin(): Vector {
    return this._origin.clone();
  }

  get zoom(): number {
    return this._zoom;
  }

  set zoom(z: number) {
    if (z >= 0.3 && z <= 20) {
      this.moved = true;
      const oldWorldSpaceMidpoint = this.origin.add(this.worldDimensions.divideScalar(2));
      this._zoom = z;
      const newWorldSpaceMidpoint = this.origin.add(this.worldDimensions.divideScalar(2));
      this.pan(newWorldSpaceMidpoint.sub(oldWorldSpaceMidpoint));
      this.zoomCallback();
    }
  }

  get screenDimensions(): Vector {
    return this._screenDimensions.clone();
  }

  set screenDimensions(v: Vector) {
    this.moved = true;
    this._screenDimensions.copy(v);
  }

  /**
   * @return {Vector} world-space w/h visible on screen
   */
  get worldDimensions(): Vector {
    return this.screenDimensions.divideScalar(this._zoom);
  }

  onScreen(v: Vector): boolean {
    const screenSpace = this.worldToScreen(v.clone());
    return (
      screenSpace.x >= 0 &&
      screenSpace.y >= 0 &&
      screenSpace.x <= this.screenDimensions.x &&
      screenSpace.y <= this.screenDimensions.y
    );
  }

  set orthographic(v: boolean) {
    this._orthographic = v;
    this.moved = true;
  }

  get orthographic(): boolean {
    return this._orthographic;
  }

  set cameraDirection(v: Vector) {
    this._cameraDirection = v;
    // Screen update
    this.moved = true;
  }

  get cameraDirection(): Vector {
    return this._cameraDirection.clone();
  }

  getCameraPosition(): Vector {
    const centre = new Vector(this._screenDimensions.x / 2, this._screenDimensions.y / 2);
    if (this._orthographic) {
      return centre.add(centre.clone().multiply(this._cameraDirection).multiplyScalar(100));
    }
    return centre.add(centre.clone().multiply(this._cameraDirection));
    // this.screenDimensions.divideScalar(2);
  }

  setZoomUpdate(callback: () => any): void {
    this.zoomCallback = callback;
  }

  /**
   * Edits vector
   */
  zoomToWorld(v: Vector): Vector {
    return v.divideScalar(this._zoom);
  }

  /**
   * Edits vector
   */
  zoomToScreen(v: Vector): Vector {
    return v.multiplyScalar(this._zoom);
  }

  /**
   * Edits vector
   */
  screenToWorld(v: Vector): Vector {
    return this.zoomToWorld(v).add(this._origin);
  }

  /**
   * Edits vector
   */
  worldToScreen(v: Vector): Vector {
    return this.zoomToScreen(v.sub(this._origin));
  }
}

import { Vector } from './vector';
import { Tensor } from './tensor';

export const enum FIELD_TYPE {
  Radial,
  Grid,
}

export abstract class BasisField {
  abstract readonly FOLDER_NAME: string;
  abstract readonly FIELD_TYPE: number;
  protected static folderNameIndex = 0;
  protected _center: Vector;

  constructor(center: Vector, protected _size: number, protected _decay: number) {
    this._center = center.clone();
  }

  set center(center: Vector) {
    this._center.copy(center);
  }

  get center(): Vector {
    return this._center.clone();
  }

  set decay(decay: number) {
    this._decay = decay;
  }

  set size(size: number) {
    this._size = size;
  }

  abstract getTensor(point: Vector): Tensor;

  getWeightedTensor(point: Vector, smooth: boolean): Tensor {
    return this.getTensor(point).scale(this.getTensorWeight(point, smooth));
  }

  protected getTensorWeight(point: Vector, smooth: boolean): number {
    const normDistanceToCentre = point.clone().sub(this._center).length() / this._size;
    if (smooth) {
      return normDistanceToCentre ** -this._decay;
    }
    // Stop (** 0) turning weight into 1, filling screen even when outside 'size'
    if (this._decay === 0 && normDistanceToCentre >= 1) {
      return 0;
    }
    return Math.max(0, 1 - normDistanceToCentre) ** this._decay;
  }
}

export class Grid extends BasisField {
  readonly FOLDER_NAME = `Grid ${Grid.folderNameIndex++}`;
  readonly FIELD_TYPE = FIELD_TYPE.Grid;

  constructor(centre: Vector, size: number, decay: number, private _theta: number) {
    super(centre, size, decay);
  }

  set theta(theta: number) {
    this._theta = theta;
  }

  getTensor(): Tensor {
    const cos = Math.cos(2 * this._theta);
    const sin = Math.sin(2 * this._theta);
    return new Tensor(1, [cos, sin]);
  }
}

export class Radial extends BasisField {
  readonly FOLDER_NAME = `Radial ${Radial.folderNameIndex++}`;
  readonly FIELD_TYPE = FIELD_TYPE.Radial;

  constructor(centre: Vector, size: number, decay: number) {
    super(centre, size, decay);
  }

  getTensor(point: Vector): Tensor {
    const t = point.clone().sub(this._center);
    const t1 = t.y ** 2 - t.x ** 2;
    const t2 = -2 * t.x * t.y;
    return new Tensor(1, [t1, t2]);
  }
}

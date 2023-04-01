/**
 * Handles generation of river and coastline
 */
import { RoadGUI } from './road-gui';
import WaterGenerator, { WaterParams } from '../impl/water-generator';
import { TensorField } from '../impl/tensor-field';
import { FieldIntegrator } from '../impl/integrator';
import { Util } from '../impl/util';
import { Vector } from '../impl/vector';
import { readFileSync } from 'fs';

export class WaterGUI extends RoadGUI {
  protected streamlines: WaterGenerator;

  constructor(
    private tensorField: TensorField,
    protected params: WaterParams,
    integrator: FieldIntegrator,
    closeTensorFolder: () => void,
    folderName: string,
    redraw: () => void,
  ) {
    super(params, integrator, closeTensorFolder, folderName, redraw);
    this.streamlines = new WaterGenerator(
      this.integrator,
      this.domainController.origin,
      this.domainController.worldDimensions,
      Object.assign({}, this.params),
      this.tensorField,
    );
  }

  initFolder(): WaterGUI {
    return this;
  }

  generateRoads(): void {
    this.preGenerateCallback();

    this.domainController.zoom = this.domainController.zoom / Util.DRAW_INFLATE_AMOUNT;
    this.streamlines = new WaterGenerator(
      this.integrator,
      this.domainController.origin,
      this.domainController.worldDimensions,
      Object.assign({}, this.params),
      this.tensorField,
    );
    this.domainController.zoom = this.domainController.zoom * Util.DRAW_INFLATE_AMOUNT;

    const fileContent = readFileSync('C:/Users/tcs11/Documents/map-generator/OSM-locations/Washington/seattle.geojson', 'utf8');
    const data = JSON.parse(fileContent);
    let originPoint = Vector.zeroVector();
    for (const feature of data.features) {
      if (feature.properties.name == "originPoint") {
        originPoint.x = feature.geometry.coordinates[1];
        originPoint.y = feature.geometry.coordinates[0];
        break;
      }
    }
    
    for (const feature of data.features) {
      if (feature.properties.natural == "water") {
        this.streamlines.createCoastFromData(feature, originPoint);
      }
    }
    // this.streamlines.createCoast();
    for (const feature of data.features) {
      if (feature.properties.waterway != null) {
        this.streamlines.createRiverFromData(feature, originPoint);
      }
    }
    // this.streamlines.createRiver();

    this.closeTensorFolder();
    this.redraw();
    this.postGenerateCallback();
  }

  /**
   * Secondary road runs along other side of river
   */
  get streamlinesWithSecondaryRoad(): Vector[][] {
    const withSecondary = this.streamlines.allStreamlinesSimple.slice();
    withSecondary.push(this.streamlines.riverSecondaryRoad);
    return withSecondary;
  }

  get rivers(): Vector[][] {
    return this.streamlines.riverPolygons.map((v) => v.map((w) => this.domainController.worldToScreen(w.clone())));
  }

  get secondaryRiver(): Vector[] {
    return this.streamlines.riverSecondaryRoad.map((v) => this.domainController.worldToScreen(v.clone()));
  }

  get coastline(): Vector[] {
    // Use unsimplified noisy streamline as coastline
    // Visual only, no road logic performed using this
    return this.streamlines.coastline.map((v) => this.domainController.worldToScreen(v.clone()));
  }

  get seaPolygons(): Vector[][] {
    return this.streamlines.seaPolygons.map((v) => v.map((w) => this.domainController.worldToScreen(w.clone())));
  }
}

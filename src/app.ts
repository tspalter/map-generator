import { Main } from './main';
import yargs from 'yargs/yargs';
import { readFileSync } from 'fs';
import { file } from 'jszip';

interface Arguments {
  [x: string]: unknown;

  outfile: string;
  minordsep: number;
  minordtest: number;
  minordstep: number;
  minordlookahead: number;
  minordcirclejoin: number;
  minorjoinangle: number;
  minorpathIterations: number;
  minorseedTries: number;
  minorsimplifyTolerance: number;
  minorcollideEarly: number
  majordsep: number;
  majordtest: number;
  majordstep: number;
  majordlookahead: number;
  majordcirclejoin: number;
  majorjoinangle: number;
  majorpathIterations: number;
  majorseedTries: number;
  majorsimplifyTolerance: number;
  majorcollideEarly: number;
  maindsep: number;
  maindtest: number;
  maindstep: number;
  maindlookahead: number;
  maindcirclejoin: number;
  mainjoinangle: number;
  mainpathIterations: number;
  mainseedTries: number;
  mainsimplifyTolerance: number;
  maincollideEarly: number;
  coastdsep: number;
  coastdtest: number;
  coastdstep: number;
  coastdlookahead: number;
  coastdcirclejoin: number;
  coastjoinangle: number;
  coastpathIterations: number;
  coastseedTries: number;
  coastsimplifyTolerance: number;
  coastcollideEarly: number;
  coastnoiseEnabled: boolean;
  coastnoiseSize: number;
  coastnoiseAngle: number;
  rivernoiseEnabled: boolean;
  rivernoiseSize: number;
  rivernoiseAngle: number;
  clusterBigParks: boolean;
  numBigParks: number;
  numSmallParks: number;
  buildingminArea: number;
  buildingshrinkSpacing: number;
  buildingchanceNoDivide: number;
  grid0X: number;
  grid0Y: number;
  grid0size: number;
  grid0decay: number;
  grid0theta: number;
  grid1X: number;
  grid1Y: number;
  grid1size: number;
  grid1decay: number;
  grid1theta: number;
  grid2X: number;
  grid2Y: number;
  grid2size: number;
  grid2decay: number;
  grid2theta: number;
  grid3X: number;
  grid3Y: number;
  grid3size: number;
  grid3decay: number;
  grid3theta: number;
  radialX: number;
  radialY: number;
  radialsize: number;
  radialdecay: number;
}

const argv: Arguments = yargs(process.argv.slice(2))
  .options({
    outfile: { type: 'string', default: 'model.zip' },
    minordsep: { type: 'number', default: 60 },
    minordtest: { type: 'number', default: 45},
    minordstep: { type: 'number', default: 1},
    minordlookahead: { type: 'number', default: 40},
    minordcirclejoin: { type: 'number', default: 5},
    minorjoinangle: { type: 'number', default: 0.1},
    minorpathIterations: { type: 'number', default: 1000},
    minorseedTries: { type: 'number', default: 300},
    minorsimplifyTolerance: { type: 'number', default: 0.5},
    minorcollideEarly: { type: 'number', default: 0},
    majordsep: { type: 'number', default: 300 },
    majordtest: { type: 'number', default: 90},
    majordstep: { type: 'number', default: 1},
    majordlookahead: { type: 'number', default: 200},
    majordcirclejoin: { type: 'number', default: 5},
    majorjoinangle: { type: 'number', default: 0.1},
    majorpathIterations: { type: 'number', default: 1000},
    majorseedTries: { type: 'number', default: 300},
    majorsimplifyTolerance: { type: 'number', default: 0.5},
    majorcollideEarly: { type: 'number', default: 0},
    maindsep: { type: 'number', default: 1200 },
    maindtest: { type: 'number', default: 600},
    maindstep: { type: 'number', default: 1},
    maindlookahead: { type: 'number', default: 500},
    maindcirclejoin: { type: 'number', default: 5},
    mainjoinangle: { type: 'number', default: 0.1},
    mainpathIterations: { type: 'number', default: 1000},
    mainseedTries: { type: 'number', default: 300},
    mainsimplifyTolerance: { type: 'number', default: 0.5},
    maincollideEarly: { type: 'number', default: 0},
    coastdsep: { type: 'number', default: 20 },
    coastdtest: { type: 'number', default: 45},
    coastdstep: { type: 'number', default: 1},
    coastdlookahead: { type: 'number', default: 40},
    coastdcirclejoin: { type: 'number', default: 5},
    coastjoinangle: { type: 'number', default: 0.1},
    coastpathIterations: { type: 'number', default: 10000},
    coastseedTries: { type: 'number', default: 300},
    coastsimplifyTolerance: { type: 'number', default: 10},
    coastcollideEarly: { type: 'number', default: 0},
    coastnoiseEnabled: { type: 'boolean', default: true},
    coastnoiseSize: { type: 'number', default: 30},
    coastnoiseAngle: { type: 'number', default: 20},
    rivernoiseEnabled: { type: 'boolean', default: true},
    rivernoiseSize: { type: 'number', default: 30},
    rivernoiseAngle: { type: 'number', default: 20},
    clusterBigParks: { type: 'boolean', default: false},
    numBigParks: { type: 'number', default: 2},
    numSmallParks: { type: 'number', default: 0},
    buildingminArea: { type: 'number', default: 800},
    buildingshrinkSpacing: { type: 'number', default: 4},
    buildingchanceNoDivide: { type: 'number', default: 0.05},
    grid0X: { type: 'number', default: 264},
    grid0Y: { type: 'number', default: 128},
    grid0size: { type: 'number', default: 1424},
    grid0decay: { type: 'number', default: 32},
    grid0theta: { type: 'number', default: 56},
    grid1X: { type: 'number', default: 1272},
    grid1Y: { type: 'number', default: 618},
    grid1size: { type: 'number', default: 1264},
    grid1decay: { type: 'number', default: 42},
    grid1theta: { type: 'number', default: 88},
    grid2X: { type: 'number', default: 1272},
    grid2Y: { type: 'number', default: 128},
    grid2size: { type: 'number', default: 406},
    grid2decay: { type: 'number', default: 9.8},
    grid2theta: { type: 'number', default: 76},
    grid3X: { type: 'number', default: 264},
    grid3Y: { type: 'number', default: 618},
    grid3size: { type: 'number', default: 364},
    grid3decay: { type: 'number', default: 34},
    grid3theta: { type: 'number', default: 30},
    radialX: { type: 'number', default: 989},
    radialY: { type: 'number', default: 304},
    radialsize: { type: 'number', default: 267},
    radialdecay: { type: 'number', default: 46},
  })
  .parseSync();

const main = new Main(argv.minordsep, 
  argv.minordtest, 
  argv.minordstep,
  argv.minordlookahead,
  argv.minordcirclejoin,
  argv.minorjoinangle,
  argv.minorpathIterations,
  argv.minorseedTries,
  argv.minorsimplifyTolerance,
  argv.minorcollideEarly,
  argv.majordsep,
  argv.majordtest,
  argv.majordstep,
  argv.majordlookahead,
  argv.majordcirclejoin,
  argv.majorjoinangle,
  argv.majorpathIterations,
  argv.majorseedTries,
  argv.majorsimplifyTolerance,
  argv.majorcollideEarly,
  argv.maindsep,
  argv.maindtest,
  argv.maindstep,
  argv.maindlookahead,
  argv.maindcirclejoin,
  argv.mainjoinangle,
  argv.mainpathIterations,
  argv.mainseedTries,
  argv.mainsimplifyTolerance,
  argv.maincollideEarly,
  argv.coastdsep,
  argv.coastdtest,
  argv.coastdstep,
  argv.coastdlookahead,
  argv.coastdcirclejoin,
  argv.coastjoinangle,
  argv.coastpathIterations,
  argv.coastseedTries,
  argv.coastsimplifyTolerance,
  argv.coastcollideEarly,
  argv.coastnoiseEnabled,
  argv.coastnoiseSize,
  argv.coastnoiseAngle,
  argv.rivernoiseEnabled,
  argv.rivernoiseSize,
  argv.rivernoiseAngle,
  argv.clusterBigParks,
  argv.numBigParks,
  argv.numSmallParks,
  argv.buildingminArea,
  argv.buildingshrinkSpacing,
  argv.buildingchanceNoDivide,
  argv.grid0X,
  argv.grid0Y,
  argv.grid0size,
  argv.grid0decay,
  argv.grid0theta,
  argv.grid1X,
  argv.grid1Y,
  argv.grid1size,
  argv.grid1decay,
  argv.grid1theta,
  argv.grid2X,
  argv.grid2Y,
  argv.grid2size,
  argv.grid2decay,
  argv.grid2theta,
  argv.grid3X,
  argv.grid3Y,
  argv.grid3size,
  argv.grid3decay,
  argv.grid3theta,
  argv.radialX,
  argv.radialY,
  argv.radialsize,
  argv.radialdecay
  );
  const fileContent = readFileSync('C:/Users/tcs11/Documents/map-generator/OSM-locations/Washington/seattle.geojson', 'utf8');
  const data = JSON.parse(fileContent);
  // console.log(data.type);
  // for(const feature of data.features) {
  //   console.log(feature.properties.name);
  // }

main.doItAll(argv.outfile).then(() => console.log('Done'));

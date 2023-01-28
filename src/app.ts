import { Main } from './main';
import yargs from 'yargs/yargs';

interface Arguments {
  [x: string]: unknown;

  outfile: string;
}

const argv: Arguments = yargs(process.argv.slice(2))
  .options({
    outfile: { type: 'string', default: 'model.zip' },
  })
  .parseSync();

const main = new Main();
main.doItAll(argv.outfile).then(() => console.log('Done'));

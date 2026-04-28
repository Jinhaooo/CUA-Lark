import { Command } from 'commander';
import { config as loadDotenv } from 'dotenv';
import { createExecCommand } from './commands/exec.js';
import { createRunCommand } from './commands/run.js';
import { createBenchCommand } from './commands/bench.js';

loadDotenv({ quiet: true });

const program = new Command();

program
  .name('cua-lark')
  .description('CUA-Lark - Computer-Use Agent for Lark')
  .version('0.1.0');

program.addCommand(createExecCommand());
program.addCommand(createRunCommand());
program.addCommand(createBenchCommand());

program.parse(process.argv);

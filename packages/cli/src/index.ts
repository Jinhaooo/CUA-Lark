import { Command } from 'commander';
import { createExecCommand } from './commands/exec.js';

const program = new Command();

program
  .name('cua-lark')
  .description('CUA-Lark - Computer-Use Agent for Lark')
  .version('0.1.0');

program.addCommand(createExecCommand());

program.parse(process.argv);

import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, extname, join, relative, resolve } from 'path';
import { pathToFileURL } from 'url';
import matter from 'gray-matter';
import { z } from 'zod';
import type { Skill } from './types.js';
import type { SkillRegistry as SkillRegistryInterface } from '../types.js';
import type { PlannerMenu } from '../_deprecated/planner/types.js';

export class SkillRegistry implements SkillRegistryInterface {
  private skills: Map<string, Skill<unknown, unknown>> = new Map();

  register(skill: Skill<unknown, unknown>): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Duplicate skill: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill<unknown, unknown> | undefined {
    return this.skills.get(name);
  }

  list(): Skill<unknown, unknown>[] {
    return Array.from(this.skills.values());
  }

  menu(): PlannerMenu[] {
    return Array.from(this.skills.values()).map((skill) => {
      const params = this.extractParamsFromSchema(skill.params);
      const description = skill.description.length > 50
        ? skill.description.substring(0, 50) + '...'
        : skill.description;
      const manualSummary = skill.manual && skill.manual.length > 80
        ? skill.manual.substring(0, 80) + '...'
        : skill.manual;

      return {
        name: skill.name,
        kind: skill.kind,
        description,
        params,
        manualSummary,
      };
    });
  }

  private extractParamsFromSchema(schema: z.ZodSchema): { name: string; type: string; required: boolean }[] {
    const result: { name: string; type: string; required: boolean }[] = [];

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      for (const [key, value] of Object.entries(shape) as [string, z.ZodTypeAny][]) {
        result.push({
          name: key,
          type: this.getZodTypeName(value),
          required: !(value instanceof z.ZodOptional),
        });
      }
    }

    return result;
  }

  private getZodTypeName(schema: z.ZodTypeAny): string {
    if (schema instanceof z.ZodString) return 'string';
    if (schema instanceof z.ZodNumber) return 'number';
    if (schema instanceof z.ZodBoolean) return 'boolean';
    if (schema instanceof z.ZodArray) return 'array';
    if (schema instanceof z.ZodObject) return 'object';
    if (schema instanceof z.ZodOptional) return this.getZodTypeName(schema.unwrap());
    if (schema instanceof z.ZodNullable) return this.getZodTypeName(schema.unwrap());
    return 'unknown';
  }

  async loadFromFs(rootDir: string): Promise<void> {
    for (const skillFile of this.findSkillFiles(rootDir)) {
      try {
        await this.loadSkillFromFile(rootDir, skillFile);
      } catch (error) {
        console.warn(`Failed to load skill from ${skillFile}:`, error);
      }
    }
  }

  private findSkillFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') {
          files.push(...this.findSkillFiles(fullPath));
        }
      } else if (entry.name === 'SKILL.md') {
        files.push(fullPath);
      }
    }
    return files;
  }

  private async loadSkillFromFile(rootDir: string, skillFile: string): Promise<void> {
    const skillDir = dirname(skillFile);
    const content = readFileSync(skillFile, 'utf8');
    const { data: frontmatter } = matter(content);

    if (!frontmatter.name) {
      throw new Error(`Invalid SKILL.md: missing name in ${skillFile}`);
    }

    const skillImplFiles = readdirSync(skillDir).filter((file) => extname(file) === '.ts');
    if (skillImplFiles.length === 0) {
      throw new Error(`No skill implementation found in ${skillDir}`);
    }

    const proceduralFile = skillImplFiles.find((file) => file === 'procedural.ts');
    const agentDrivenFile = skillImplFiles.find((file) => file === 'agent_driven.ts');

    if (agentDrivenFile && proceduralFile) {
      const agentDrivenSkill = await this.importSkill(rootDir, skillDir, agentDrivenFile);
      agentDrivenSkill.name = `${frontmatter.name}_agent_driven`;
      this.applyFrontmatter(agentDrivenSkill, frontmatter);
      this.register(agentDrivenSkill);
    }

    if (proceduralFile) {
      const proceduralSkill = await this.importSkill(rootDir, skillDir, proceduralFile);
      if (proceduralSkill.name !== frontmatter.name) {
        throw new Error(`Skill name mismatch: ${proceduralSkill.name} !== ${frontmatter.name} in ${skillFile}`);
      }
      const autoFallbackEnabled = frontmatter.fallback !== false && frontmatter.autoFallback !== false;
      if (agentDrivenFile && !proceduralSkill.fallback && autoFallbackEnabled) {
        proceduralSkill.fallback = `${frontmatter.name}_agent_driven`;
      }
      this.applyFrontmatter(proceduralSkill, frontmatter);
      this.register(proceduralSkill);
      return;
    }

    const implFile = agentDrivenFile ?? skillImplFiles[0]!;
    const skill = await this.importSkill(rootDir, skillDir, implFile);
    if (skill.name !== frontmatter.name) {
      throw new Error(`Skill name mismatch: ${skill.name} !== ${frontmatter.name} in ${skillFile}`);
    }
    this.applyFrontmatter(skill, frontmatter);
    this.register(skill);
  }

  private async importSkill(rootDir: string, skillDir: string, implFile: string): Promise<Skill<unknown, unknown>> {
    const implPath = this.resolveImportPath(rootDir, skillDir, implFile);
    const module = await this.importModule(implPath);
    const skill = module.default;
    if (!skill || typeof skill !== 'object') {
      throw new Error(`Invalid skill implementation in ${implPath}`);
    }
    return skill;
  }

  private async importModule(implPath: string): Promise<any> {
    try {
      return await import(pathToFileURL(implPath).href);
    } catch (error) {
      if (!process.env.VITEST || extname(implPath) !== '.js') {
        throw error;
      }

      const source = readFileSync(implPath, 'utf8');
      const dataUrl = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
      return import(dataUrl);
    }
  }

  private applyFrontmatter(skill: Skill<unknown, unknown>, frontmatter: Record<string, unknown>): void {
    if (frontmatter.verifyDifficulty) {
      skill.verifyDifficulty = frontmatter.verifyDifficulty as Skill<unknown, unknown>['verifyDifficulty'];
    }
    if (frontmatter.verifyStrategy) {
      skill.verifyStrategy = frontmatter.verifyStrategy as Skill<unknown, unknown>['verifyStrategy'];
    }
    if (frontmatter.sideEffects && !skill.sideEffects) {
      skill.sideEffects = frontmatter.sideEffects as Skill<unknown, unknown>['sideEffects'];
    }
  }

  private resolveImportPath(rootDir: string, skillDir: string, implFile: string): string {
    const sourcePath = resolve(skillDir, implFile);

    if (extname(implFile) === '.ts') {
      const compiledPath = resolve(rootDir, 'dist', relative(rootDir, skillDir), implFile.replace(/\.ts$/, '.js'));
      if (existsSync(compiledPath)) {
        return compiledPath;
      }
    }

    return sourcePath;
  }
}

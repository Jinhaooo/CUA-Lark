import type { Skill } from './types.js';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, extname, join, relative, resolve } from 'path';
import { pathToFileURL } from 'url';
import matter from 'gray-matter';
import type { SkillRegistry as SkillRegistryInterface } from '../types.js';

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

  async loadFromFs(rootDir: string): Promise<void> {
    const skillFiles = this.findSkillFiles(rootDir);
    
    for (const skillFile of skillFiles) {
      await this.loadSkillFromFile(rootDir, skillFile);
    }
  }

  private findSkillFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
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
    
    if (!frontmatter.name || !frontmatter.kind) {
      throw new Error(`Invalid SKILL.md: missing name or kind in ${skillFile}`);
    }
    
    // 查找同目录下的技能实现文件
    const skillImplFiles = readdirSync(skillDir).filter(file => 
      extname(file) === '.ts' && file !== 'SKILL.md'
    );
    
    if (skillImplFiles.length === 0) {
      throw new Error(`No skill implementation found in ${skillDir}`);
    }
    
    // 动态导入技能实现
    const implFile = skillImplFiles[0];
    if (!implFile) {
      throw new Error(`No skill implementation found in ${skillDir}`);
    }

    const implPath = this.resolveImportPath(rootDir, skillDir, implFile);
    const module = await import(pathToFileURL(implPath).href);
    const skill = module.default;
    
    if (!skill || typeof skill !== 'object') {
      throw new Error(`Invalid skill implementation in ${implPath}`);
    }
    
    if (skill.name !== frontmatter.name) {
      throw new Error(`Skill name mismatch: ${skill.name} !== ${frontmatter.name} in ${skillFile}`);
    }
    
    this.register(skill);
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

import * as typescript from 'typescript';

describe('Project Setup', () => {
  it('should have Node.js environment', () => {
    expect(process.version).toBeDefined();
  });

  it('should support TypeScript', () => {
    const tsVersion: string = typescript.version;
    expect(tsVersion).toBeDefined();
  });
});

import fs from 'fs';
import path from 'path';
import { zipFolder } from '../archive_utils';
import StreamZip from 'node-stream-zip';

describe('zipFolder', () => {
    const testDir = path.join(__dirname, 'test-zip-folder');
    const outputZip = path.join(__dirname, 'output.zip');

    beforeEach(() => {
        // Create test directory structure
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir);
        }
        
        // Create some test files and directories
        fs.writeFileSync(path.join(testDir, 'file1.txt'), 'test content 1');
        fs.writeFileSync(path.join(testDir, 'file2.txt'), 'test content 2');
        
        // Create .git directory with some content
        const gitDir = path.join(testDir, '.git');
        if (!fs.existsSync(gitDir)) {
            fs.mkdirSync(gitDir);
        }
        fs.writeFileSync(path.join(gitDir, 'config'), 'git config content');
        
        // Create node_modules directory with some content
        const nodeModulesDir = path.join(testDir, 'node_modules');
        if (!fs.existsSync(nodeModulesDir)) {
            fs.mkdirSync(nodeModulesDir);
        }
        fs.writeFileSync(path.join(nodeModulesDir, 'package.json'), '{}');
    });

    afterEach(() => {
        // Clean up test directories and files
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
        if (fs.existsSync(outputZip)) {
            fs.unlinkSync(outputZip);
        }
    });

    it('should create a zip file excluding .git and node_modules by default', async () => {
        await zipFolder(testDir, outputZip);
        
        const zip = new StreamZip.async({ file: outputZip });
        const entries = await zip.entries();
        const fileNames = Object.keys(entries);
        
        // Check that regular files are included
        expect(fileNames).toContain('file1.txt');
        expect(fileNames).toContain('file2.txt');
        
        // Check that .git and node_modules are excluded
        expect(fileNames.some(name => name.includes('.git/'))).toBeFalsy();
        expect(fileNames.some(name => name.includes('node_modules/'))).toBeFalsy();
        
        await zip.close();
    });

    it('should respect custom exclude patterns', async () => {
        await zipFolder(testDir, outputZip, false, ['**/*.txt']);
        
        const zip = new StreamZip.async({ file: outputZip });
        const entries = await zip.entries();
        const fileNames = Object.keys(entries);
        
        // Check that .txt files are excluded
        expect(fileNames.some(name => name.endsWith('.txt'))).toBeFalsy();
        
        // But other files should be included
        expect(fileNames.some(name => name.includes('.git/config'))).toBeTruthy();
        expect(fileNames.some(name => name.includes('node_modules/package.json'))).toBeTruthy();
        
        await zip.close();
    });

    it('should include all files when exclude list is empty', async () => {
        await zipFolder(testDir, outputZip, false, []);
        
        const zip = new StreamZip.async({ file: outputZip });
        const entries = await zip.entries();
        const fileNames = Object.keys(entries);
        
        // Check that all files are included
        expect(fileNames).toContain('file1.txt');
        expect(fileNames).toContain('file2.txt');
        expect(fileNames.some(name => name.includes('.git/config'))).toBeTruthy();
        expect(fileNames.some(name => name.includes('node_modules/package.json'))).toBeTruthy();
        
        await zip.close();
    });

    it('should use subdirectory name when provided', async () => {
        const subdir = 'custom-subdir';
        await zipFolder(testDir, outputZip, subdir);
        
        const zip = new StreamZip.async({ file: outputZip });
        const entries = await zip.entries();
        const fileNames = Object.keys(entries);
        
        // Check that files are under the custom subdirectory
        expect(fileNames).toContain(`${subdir}/file1.txt`);
        expect(fileNames).toContain(`${subdir}/file2.txt`);
        
        // Check that excluded directories are still excluded
        expect(fileNames.some(name => name.includes('.git/'))).toBeFalsy();
        expect(fileNames.some(name => name.includes('node_modules/'))).toBeFalsy();
        
        await zip.close();
    });
});
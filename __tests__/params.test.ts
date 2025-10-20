import * as github from '@actions/github';
import { getBranchName } from '../params';

// Mock the @actions modules
jest.mock('@actions/github');

describe('getBranchName', () => {
  describe('Priority 1: Explicit branch input', () => {
    it('should use the provided branch input when given', () => {
      const mockGithubContext = {
        payload: {},
        ref: 'refs/heads/main',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName('feature/custom-branch');
      expect(result).toBe('feature/custom-branch');
    });

    it('should trim whitespace from branch input', () => {
      const mockGithubContext = {
        payload: {},
        ref: 'refs/heads/main',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName('  feature/custom-branch  ');
      expect(result).toBe('feature/custom-branch');
    });

    it('should ignore empty branch input', () => {
      const mockGithubContext = {
        payload: {},
        ref: 'refs/heads/main',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName('   '); // Only whitespace
      expect(result).toBe('main'); // Should fall back to parsing ref
    });
  });

  describe('Priority 2: Pull request context', () => {
    it('should use PR head ref when available and no branch input provided', () => {
      const mockGithubContext = {
        payload: {
          pull_request: {
            head: {
              ref: 'feature/pr-branch',
              sha: 'abc123'
            }
          }
        },
        ref: 'refs/heads/main',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName();
      expect(result).toBe('feature/pr-branch');
    });

    it('should throw error when PR exists but head.ref is missing', () => {
      const mockGithubContext = {
        payload: {
          pull_request: {
            head: {
              // ref is missing
              sha: 'abc123'
            }
          }
        },
        ref: 'refs/heads/main',
      };
      (github as any).context = mockGithubContext;

      expect(() => getBranchName()).toThrow('Unable find pull request ref');
    });

    it('should prefer branch input over PR context when both exist', () => {
      const mockGithubContext = {
        payload: {
          pull_request: {
            head: {
              ref: 'feature/pr-branch',
              sha: 'abc123'
            }
          }
        },
        ref: 'refs/heads/main',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName('override/branch');
      expect(result).toBe('override/branch');
    });
  });

  describe('Priority 3: GitHub ref parsing', () => {
    it('should parse branch from refs/heads format', () => {
      const mockGithubContext = {
        payload: {},
        ref: 'refs/heads/feature/some-branch',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName();
      expect(result).toBe('feature/some-branch');
    });

    it('should parse tag from refs/tags format', () => {
      const mockGithubContext = {
        payload: {},
        ref: 'refs/tags/v1.2.3',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName();
      expect(result).toBe('v1.2.3');
    });

    it('should throw error for invalid ref format', () => {
      const mockGithubContext = {
        payload: {},
        ref: 'invalid-ref-format',
      };
      (github as any).context = mockGithubContext;

      expect(() => getBranchName()).toThrow('Failed to parse GitHub ref: invalid-ref-format');
    });
  });

  describe('Priority order verification', () => {
    it('should follow correct priority: input > PR > ref', () => {
      // Test with all three sources available
      let mockGithubContext: any = {
        payload: {
          pull_request: {
            head: {
              ref: 'pr-branch',
              sha: 'abc123'
            }
          }
        },
        ref: 'refs/heads/ref-branch',
      };

      // Test 1: With branch input (should use input)
      (github as any).context = mockGithubContext;
      let result = getBranchName('input-branch');
      expect(result).toBe('input-branch');

      // Test 2: Without branch input (should use PR)
      (github as any).context = mockGithubContext;
      result = getBranchName();
      expect(result).toBe('pr-branch');

      // Test 3: Without branch input and PR (should use ref)
      mockGithubContext = {
        payload: {},
        ref: 'refs/heads/ref-branch',
      };
      (github as any).context = mockGithubContext;
      result = getBranchName();
      expect(result).toBe('ref-branch');
    });
  });

  describe('Edge cases', () => {
    it('should handle branch names with slashes correctly', () => {
      const mockGithubContext = {
        payload: {},
        ref: 'refs/heads/feature/JIRA-123/add-new-feature',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName();
      expect(result).toBe('feature/JIRA-123/add-new-feature');
    });

    it('should handle special characters in branch names', () => {
      const mockGithubContext = {
        payload: {},
        ref: 'refs/heads/fix-bug-#123',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName();
      expect(result).toBe('fix-bug-#123');
    });

    it('should handle branch input with only branch name (no refs prefix)', () => {
      const mockGithubContext = {
        payload: {},
        ref: 'refs/heads/main',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName('my-feature-branch');
      expect(result).toBe('my-feature-branch');
    });
  });

  describe('Issue comment trigger scenarios', () => {
    it('should use branch input for issue_comment triggers', () => {
      // Simulating issue_comment trigger where context.ref is main
      // but we want to test a PR branch
      const mockGithubContext = {
        payload: {
          // No pull_request in issue_comment events
          issue: {
            number: 123
          }
        },
        ref: 'refs/heads/main', // Always main for issue_comment
      };
      (github as any).context = mockGithubContext;

      // Branch name would be fetched via gh CLI and passed as input
      const result = getBranchName('feature/pr-branch-from-gh-cli');
      expect(result).toBe('feature/pr-branch-from-gh-cli');
    });

    it('should fall back to main when no branch input in issue_comment context', () => {
      const mockGithubContext = {
        payload: {
          issue: {
            number: 123
          }
        },
        ref: 'refs/heads/main',
      };
      (github as any).context = mockGithubContext;

      const result = getBranchName();
      expect(result).toBe('main'); // Falls back to parsing ref
    });
  });
});
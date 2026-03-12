import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/components/toast';
import { SkillsPage } from '@/pages/SkillsPage';

interface MockSkill {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  sourceType: 'uploaded' | 'git_repo' | 'marketplace' | 'builtin';
  enabled: boolean;
  currentVersion: string | null;
  latestVetting: 'passed' | 'failed' | 'warning' | 'pending' | null;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function renderSkillsPage() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/skills']}>
      <ToastProvider>
        <AuthProvider>
          <SkillsPage />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Skills Page', () => {
  beforeEach(() => {
    const skills: MockSkill[] = [];
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/api/v1/auth/me')) {
        return jsonResponse({
          data: {
            user: {
              id: 'admin-1',
              email: 'admin@example.com',
              role: 'super_admin',
              displayName: 'System Admin',
            },
          },
        });
      }

      if (url.endsWith('/api/v1/skills') && method === 'GET') {
        return jsonResponse({ data: skills });
      }

      if (url.endsWith('/api/v1/skills/ingest') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          slug: string;
          displayName: string;
          description?: string;
          sourceType: MockSkill['sourceType'];
          version: string;
        };

        if (body.slug === 'shell-helper') {
          skills.push({
            id: 'skill-blocked',
            slug: body.slug,
            displayName: body.displayName,
            description: body.description ?? null,
            sourceType: body.sourceType,
            enabled: false,
            currentVersion: body.version,
            latestVetting: 'failed',
          });

          return jsonResponse({
            data: {
              skillId: 'skill-blocked',
              versionId: 'ver-blocked',
              codeHash: 'b'.repeat(64),
              vettingResult: 'failed',
              detectedRisks: [
                {
                  rule: 'SEC-010',
                  severity: 'critical',
                  description: 'child_process import detected',
                  location: null,
                  line: 1,
                  snippet: "require('child_process')",
                },
              ],
              reasons: ['Blocked: child_process import detected'],
            },
          }, 422);
        }

        skills.push({
          id: 'skill-safe',
          slug: body.slug,
          displayName: body.displayName,
          description: body.description ?? null,
          sourceType: body.sourceType,
          enabled: false,
          currentVersion: body.version,
          latestVetting: 'passed',
        });

        return jsonResponse({
          data: {
            skillId: 'skill-safe',
            versionId: 'ver-safe',
            codeHash: 'a'.repeat(64),
            vettingResult: 'passed',
            detectedRisks: [],
            reasons: [],
          },
        }, 201);
      }

      if (url.endsWith('/api/v1/skills/skill-safe/enabled') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { enabled: boolean };
        const skill = skills.find((entry) => entry.id === 'skill-safe');
        if (skill) {
          skill.enabled = body.enabled;
        }
        return jsonResponse({ data: skill });
      }

      if (url.includes('/api/v1/skills/') && url.endsWith('/vetting-history')) {
        return jsonResponse({ data: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });
  });

  it('installs and enables a safe demo skill from the portal', async () => {
    const user = userEvent.setup();
    renderSkillsPage();

    await waitFor(() => {
      expect(screen.getByText('No skills installed')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Add Your First Skill' }));
    await user.click(screen.getByRole('button', { name: /Load Safe Demo/i }));
    await user.click(screen.getByRole('button', { name: 'Install Skill' }));

    await waitFor(() => {
      expect(screen.getByText('Quote Summarizer')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    expect(screen.getByText('quote-summarizer')).toBeInTheDocument();
  });

  it('shows blocked vetting details and exposes super-admin override controls', async () => {
    const user = userEvent.setup();
    renderSkillsPage();

    await waitFor(() => {
      expect(screen.getByText('No skills installed')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Add Your First Skill' }));
    await user.click(screen.getByRole('button', { name: /Load Security Demo/i }));
    await user.click(screen.getByRole('button', { name: 'Install Skill' }));

    await waitFor(() => {
      expect(screen.getByText('Latest Security Review')).toBeInTheDocument();
    });

    expect(screen.getByText('Blocked: child_process import detected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.getByText('Shell Helper')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Manual Override/i })).toBeInTheDocument();
    expect(screen.getByText(/blocked by vetting/i)).toBeInTheDocument();
  });
});

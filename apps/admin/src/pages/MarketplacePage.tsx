import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/toast';
import { apiClient } from '@/api/client';
import {
  Search,
  Download,
  Star,
  Shield,
  ShieldCheck,
  Loader2,
  BarChart3,
  Globe,
  Calendar,
  FileText,
  Calculator,
  Users,
  Mail,
  Database,
  Wrench,
} from 'lucide-react';

interface MarketplaceSkill {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  author: string;
  version: string;
  category: string;
  rating: number;
  downloads: number;
  verified: boolean;
  tags: string[];
  icon: string;
  sourceUrl: string;
  createdAt: string;
}

const CATEGORY_ICONS: Record<string, typeof BarChart3> = {
  analytics: BarChart3,
  web: Globe,
  scheduling: Calendar,
  documents: FileText,
  finance: Calculator,
  crm: Users,
  communication: Mail,
  data: Database,
  utilities: Wrench,
};

// Mock marketplace catalog
const MARKETPLACE_SKILLS: MarketplaceSkill[] = [
  {
    id: 'mkt-1',
    slug: 'web-scraper',
    displayName: 'Smart Web Scraper',
    description: 'Extract structured data from any webpage. Supports CSS selectors, XPath, and automatic content detection. Perfect for lead research and competitive analysis.',
    author: 'NexClaw Community',
    version: '2.1.0',
    category: 'web',
    rating: 4.8,
    downloads: 12450,
    verified: true,
    tags: ['scraping', 'data-extraction', 'research'],
    icon: 'globe',
    sourceUrl: 'https://github.com/nexclaw-skills/web-scraper',
    createdAt: '2025-11-15',
  },
  {
    id: 'mkt-2',
    slug: 'invoice-generator',
    displayName: 'Invoice Generator',
    description: 'Generate professional PDF invoices from structured data. Supports multiple templates, tax calculations, and automatic numbering. Integrates with bookkeeping workflows.',
    author: 'FinanceTools Inc.',
    version: '1.4.2',
    category: 'finance',
    rating: 4.6,
    downloads: 8930,
    verified: true,
    tags: ['invoicing', 'pdf', 'finance', 'billing'],
    icon: 'calculator',
    sourceUrl: 'https://github.com/nexclaw-skills/invoice-generator',
    createdAt: '2025-12-01',
  },
  {
    id: 'mkt-3',
    slug: 'calendar-scheduler',
    displayName: 'Calendar Scheduler',
    description: 'Manage appointments and scheduling via natural language. Integrates with Google Calendar, Outlook, and Calendly. Supports timezone conversion and conflict detection.',
    author: 'ProductivityLabs',
    version: '3.0.1',
    category: 'scheduling',
    rating: 4.9,
    downloads: 15200,
    verified: true,
    tags: ['calendar', 'scheduling', 'appointments', 'productivity'],
    icon: 'calendar',
    sourceUrl: 'https://github.com/nexclaw-skills/calendar-scheduler',
    createdAt: '2025-10-20',
  },
  {
    id: 'mkt-4',
    slug: 'document-summarizer',
    displayName: 'Document Summarizer',
    description: 'Summarize long documents, PDFs, and articles into concise bullet points or executive summaries. Supports multiple output formats and customizable detail levels.',
    author: 'AIDocTools',
    version: '1.2.0',
    category: 'documents',
    rating: 4.5,
    downloads: 6780,
    verified: false,
    tags: ['summarization', 'documents', 'pdf', 'nlp'],
    icon: 'file-text',
    sourceUrl: 'https://github.com/nexclaw-skills/doc-summarizer',
    createdAt: '2026-01-10',
  },
  {
    id: 'mkt-5',
    slug: 'email-campaign-manager',
    displayName: 'Email Campaign Manager',
    description: 'Create and manage email marketing campaigns. Draft personalized emails, A/B test subject lines, and track open rates. Works with SendGrid, Mailgun, and SMTP.',
    author: 'MarketingAI',
    version: '2.0.0',
    category: 'communication',
    rating: 4.3,
    downloads: 4520,
    verified: true,
    tags: ['email', 'marketing', 'campaigns', 'outreach'],
    icon: 'mail',
    sourceUrl: 'https://github.com/nexclaw-skills/email-campaigns',
    createdAt: '2026-01-25',
  },
  {
    id: 'mkt-6',
    slug: 'crm-enricher',
    displayName: 'CRM Data Enricher',
    description: 'Automatically enrich CRM contact records with publicly available data. Finds LinkedIn profiles, company info, and social media handles from email addresses.',
    author: 'DataEnrich Co.',
    version: '1.1.3',
    category: 'crm',
    rating: 4.7,
    downloads: 9100,
    verified: true,
    tags: ['crm', 'enrichment', 'leads', 'data'],
    icon: 'users',
    sourceUrl: 'https://github.com/nexclaw-skills/crm-enricher',
    createdAt: '2025-12-15',
  },
  {
    id: 'mkt-7',
    slug: 'analytics-reporter',
    displayName: 'Analytics Reporter',
    description: 'Generate natural-language analytics reports from raw data. Connects to Google Analytics, Mixpanel, and custom databases. Identifies trends and anomalies automatically.',
    author: 'InsightAI',
    version: '1.0.5',
    category: 'analytics',
    rating: 4.4,
    downloads: 3200,
    verified: false,
    tags: ['analytics', 'reporting', 'data-viz', 'insights'],
    icon: 'bar-chart',
    sourceUrl: 'https://github.com/nexclaw-skills/analytics-reporter',
    createdAt: '2026-02-01',
  },
  {
    id: 'mkt-8',
    slug: 'database-query-assistant',
    displayName: 'Database Query Assistant',
    description: 'Convert natural language questions to SQL queries. Supports PostgreSQL, MySQL, and SQLite. Includes schema introspection and query optimization suggestions.',
    author: 'NexClaw Community',
    version: '1.3.0',
    category: 'data',
    rating: 4.6,
    downloads: 7800,
    verified: true,
    tags: ['sql', 'database', 'queries', 'natural-language'],
    icon: 'database',
    sourceUrl: 'https://github.com/nexclaw-skills/db-query-assistant',
    createdAt: '2025-11-28',
  },
  {
    id: 'mkt-9',
    slug: 'social-media-poster',
    displayName: 'Social Media Poster',
    description: 'Draft and schedule social media posts across platforms. Supports Twitter/X, LinkedIn, Instagram, and Facebook. Includes hashtag suggestions and optimal posting times.',
    author: 'SocialAI Labs',
    version: '2.2.1',
    category: 'communication',
    rating: 4.2,
    downloads: 5600,
    verified: false,
    tags: ['social-media', 'marketing', 'scheduling', 'content'],
    icon: 'globe',
    sourceUrl: 'https://github.com/nexclaw-skills/social-poster',
    createdAt: '2026-02-10',
  },
  {
    id: 'mkt-10',
    slug: 'contract-reviewer',
    displayName: 'Contract Reviewer',
    description: 'Analyze legal contracts and highlight key clauses, risks, and unusual terms. Supports NDA, MSA, SOW, and employment agreement templates. Not legal advice.',
    author: 'LegalTech Tools',
    version: '1.0.2',
    category: 'documents',
    rating: 4.1,
    downloads: 2100,
    verified: false,
    tags: ['legal', 'contracts', 'review', 'compliance'],
    icon: 'file-text',
    sourceUrl: 'https://github.com/nexclaw-skills/contract-reviewer',
    createdAt: '2026-03-01',
  },
];

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'web', label: 'Web' },
  { value: 'scheduling', label: 'Scheduling' },
  { value: 'documents', label: 'Documents' },
  { value: 'finance', label: 'Finance' },
  { value: 'crm', label: 'CRM' },
  { value: 'communication', label: 'Communication' },
  { value: 'data', label: 'Data' },
  { value: 'utilities', label: 'Utilities' },
];

const SORT_OPTIONS = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name (A-Z)' },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating.toFixed(1)}</span>
    </div>
  );
}

function SkillCard({
  skill,
  onInstall,
  installing,
}: {
  skill: MarketplaceSkill;
  onInstall: (skill: MarketplaceSkill) => void;
  installing: boolean;
}) {
  const Icon = CATEGORY_ICONS[skill.category] ?? Wrench;

  return (
    <Card className="flex flex-col transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">{skill.displayName}</CardTitle>
              {skill.verified && (
                <span title="Verified skill">
                  <ShieldCheck className="h-4 w-4 flex-shrink-0 text-green-500" />
                </span>
              )}
            </div>
            <CardDescription className="text-xs">
              by {skill.author} &middot; v{skill.version}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <p className="text-xs text-muted-foreground line-clamp-3">{skill.description}</p>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {skill.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <StarRating rating={skill.rating} />
              <p className="text-[10px] text-muted-foreground">
                {skill.downloads.toLocaleString()} installs
              </p>
            </div>
            <Button
              size="sm"
              variant={skill.verified ? 'default' : 'outline'}
              onClick={() => onInstall(skill)}
              disabled={installing}
              className="gap-1.5"
            >
              {installing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              Install
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('popular');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const { toast } = useToast();

  const filtered = useMemo(() => {
    let skills = [...MARKETPLACE_SKILLS];

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      skills = skills.filter(
        (s) =>
          s.displayName.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)) ||
          s.author.toLowerCase().includes(q),
      );
    }

    // Filter by category
    if (category) {
      skills = skills.filter((s) => s.category === category);
    }

    // Sort
    switch (sort) {
      case 'popular':
        skills.sort((a, b) => b.downloads - a.downloads);
        break;
      case 'rating':
        skills.sort((a, b) => b.rating - a.rating);
        break;
      case 'newest':
        skills.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case 'name':
        skills.sort((a, b) => a.displayName.localeCompare(b.displayName));
        break;
    }

    return skills;
  }, [search, category, sort]);

  const handleInstall = async (skill: MarketplaceSkill) => {
    setInstallingId(skill.id);
    try {
      // Simulate installation by ingesting the skill
      await apiClient.post('/skills/ingest', {
        slug: skill.slug,
        displayName: skill.displayName,
        description: skill.description,
        sourceType: 'marketplace',
        sourceUrl: skill.sourceUrl,
        version: skill.version,
        source: `// Marketplace skill: ${skill.displayName}\n// This is a placeholder source.\n// In production, the source would be fetched from the marketplace registry.\nfunction ${skill.slug.replace(/-/g, '_')}(args) {\n  return { status: 'ok', message: 'Skill installed from marketplace' };\n}\n`,
        toolName: skill.slug.replace(/-/g, '_'),
        toolDescription: skill.description,
        toolParameters: JSON.stringify({
          type: 'object',
          properties: { input: { type: 'string', description: 'Input for the tool' } },
          required: ['input'],
        }),
        enableAfterIngest: false,
      });
      toast('success', `${skill.displayName} installed and pending security review.`);
    } catch {
      toast('error', 'Could not install the skill. Please try again.');
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skill Marketplace"
        description="Browse and install community skills to extend your NexClaw agent's capabilities."
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-40">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-40">
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{filtered.length} skill{filtered.length !== 1 ? 's' : ''} found</span>
        <span className="flex items-center gap-1">
          <Shield className="h-3.5 w-3.5" />
          {MARKETPLACE_SKILLS.filter((s) => s.verified).length} verified
        </span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-lg font-medium">No skills found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onInstall={() => void handleInstall(skill)}
              installing={installingId === skill.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

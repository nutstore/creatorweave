/**
 * Predefined MCP Providers
 *
 * Built-in MCP server configurations for popular services:
 * - GitHub: PR/Issue/Repo access
 * - GitLab: MR/Issue access
 * - Jira: Task tracking
 * - Database: SQL queries
 * - Google Drive: Cloud files
 * - Notion: Notes sync
 */

import type { MCPServerConfig } from './mcp-types'

//=============================================================================
// Provider Registry
//=============================================================================

export interface MCPPresetProvider {
  id: string
  name: string
  description: string
  category: 'development' | 'data' | 'productivity' | 'communication'
  icon: string
  config: MCPServerConfig
  setupInstructions: string
  requiredEnvVars: Array<{
    name: string
    description: string
    where: 'url' | 'token' | 'env'
  }>
}

export const PRESET_PROVIDERS: MCPPresetProvider[] = [
  // Development
  {
    id: 'figma',
    name: 'Figma MCP Remote',
    description: 'Access Figma files, nodes, and design data through the official remote MCP service',
    category: 'development',
    icon: 'figma',
    config: {
      id: 'figma',
      name: 'Figma MCP Remote',
      description: 'Official Figma remote MCP service',
      url: 'https://mcp.figma.com/mcp',
      transport: 'streamable_http',
      enabled: false,
      type: 'user',
    },
    setupInstructions: `
1. Create a Figma access token or follow the official Figma MCP auth flow
2. Use the remote MCP endpoint:
   https://mcp.figma.com/mcp
3. Paste your token into the Auth Token field in CreatorWeave
4. Recommended transport: Streamable HTTP
    `.trim(),
    requiredEnvVars: [
      {
        name: 'FIGMA_TOKEN',
        description: 'Figma access token for MCP authentication',
        where: 'token',
      },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Access PRs, issues, repositories, and code',
    category: 'development',
    icon: 'github',
    config: {
      id: 'github',
      name: 'GitHub',
      description: 'Access GitHub repositories, pull requests, issues, and more',
      url: 'https://github.com/mcp/github',
      transport: 'sse',
      enabled: false,
      type: 'user',
    },
    setupInstructions: `
1. Create a GitHub Personal Access Token (classic) with scopes:
   - repo: Full control of private repositories
   - read:user: Read user profile data
   - read:org: Read org and team membership

2. Set the token in the environment variables or URL:
   - As env var: GITHUB_TOKEN=your_token
   - Or in URL: https://github.com/mcp/github?token=your_token

3. For enterprise GitHub, use custom URL:
   https://your-github-enterprise.com/mcp
    `.trim(),
    requiredEnvVars: [
      {
        name: 'GITHUB_TOKEN',
        description: 'GitHub Personal Access Token',
        where: 'env',
      },
    ],
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Access GitLab merge requests, issues, and repositories',
    category: 'development',
    icon: 'gitlab',
    config: {
      id: 'gitlab',
      name: 'GitLab',
      description: 'Access GitLab MRs, issues, and CI/CD pipelines',
      url: 'https://gitlab.com/api/mcp',
      transport: 'sse',
      enabled: false,
      type: 'user',
    },
    setupInstructions: `
1. Create a GitLab Personal Access Token with scopes:
   - read_api: Read GitLab API
   - read_repository: Read repositories
   - read_user: Read user information

2. Set the token as environment variable:
   GITLAB_PERSONAL_TOKEN=your_token

3. For self-hosted GitLab, use custom URL:
   https://gitlab.your-company.com/api/mcp
    `.trim(),
    requiredEnvVars: [
      {
        name: 'GITLAB_PERSONAL_TOKEN',
        description: 'GitLab Personal Access Token',
        where: 'env',
      },
    ],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Access Jira issues, sprints, and projects',
    category: 'development',
    icon: 'jira',
    config: {
      id: 'jira',
      name: 'Jira',
      description: 'Track and manage Jira issues, sprints, and projects',
      url: 'https://jira.example.com/mcp',
      transport: 'sse',
      enabled: false,
      type: 'user',
    },
    setupInstructions: `
1. Create a Jira API token:
   - Go to https://id.atlassian.com/manage-profile/security/api-tokens
   - Create a new API token

2. Set environment variables:
   JIRA_URL=https://your-domain.atlassian.net
   JIRA_EMAIL=your-email@example.com
   JIRA_API_TOKEN=your_api_token

3. For Cloud Jira, URL format is:
   https://your-domain.atlassian.net
    `.trim(),
    requiredEnvVars: [
      {
        name: 'JIRA_URL',
        description: 'Jira instance URL',
        where: 'env',
      },
      {
        name: 'JIRA_EMAIL',
        description: 'Email associated with Jira account',
        where: 'env',
      },
      {
        name: 'JIRA_API_TOKEN',
        description: 'Jira API token',
        where: 'env',
      },
    ],
  },

  // Data
  {
    id: 'database',
    name: 'Database (PostgreSQL)',
    description: 'Execute SQL queries and manage database operations',
    category: 'data',
    icon: 'database',
    config: {
      id: 'database-postgres',
      name: 'PostgreSQL Database',
      description: 'Execute queries and manage PostgreSQL databases',
      url: 'http://localhost:3001/mcp-database',
      transport: 'sse',
      enabled: false,
      type: 'user',
      env: {
        DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
        DATABASE_TYPE: 'postgres',
      },
    },
    setupInstructions: `
1. Start the database MCP server:
   npx -y @modelcontextprotocol/server-postgres postgresql://user:pass@localhost:5432/database

2. Configure connection:
   - DATABASE_URL: Full PostgreSQL connection string
   - Optional: DATABASE_SSL=true for SSL connections

3. Security note: Consider using environment variables for credentials
    `.trim(),
    requiredEnvVars: [
      {
        name: 'DATABASE_URL',
        description: 'PostgreSQL connection URL',
        where: 'env',
      },
    ],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Access and manage Google Drive files',
    category: 'data',
    icon: 'google-drive',
    config: {
      id: 'google-drive',
      name: 'Google Drive',
      description: 'Read and write files in Google Drive',
      url: 'https://google-drive-mcp.example.com',
      transport: 'sse',
      enabled: false,
      type: 'user',
    },
    setupInstructions: `
1. Set up Google Cloud Console:
   - Create a new project or select existing
   - Enable Google Drive API
   - Create OAuth 2.0 credentials

2. Configure environment variables:
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:8080/callback

3. First run will open browser for OAuth consent
    `.trim(),
    requiredEnvVars: [
      {
        name: 'GOOGLE_CLIENT_ID',
        description: 'Google OAuth Client ID',
        where: 'env',
      },
      {
        name: 'GOOGLE_CLIENT_SECRET',
        description: 'Google OAuth Client Secret',
        where: 'env',
      },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Sync and manage Notion pages and databases',
    category: 'productivity',
    icon: 'notion',
    config: {
      id: 'notion',
      name: 'Notion',
      description: 'Access and manage Notion pages and databases',
      url: 'https://notion-mcp.example.com',
      transport: 'sse',
      enabled: false,
      type: 'user',
    },
    setupInstructions: `
1. Create a Notion Integration:
   - Go to https://www.notion.so/my-integrations
   - Create new integration with capabilities:
     * Read content
     * Update content
     * Insert content

2. Get the Internal Integration Token

3. Share pages/databases with the integration

4. Set environment variable:
   NOTION_API_KEY=your_integration_token
    `.trim(),
    requiredEnvVars: [
      {
        name: 'NOTION_API_KEY',
        description: 'Notion Integration Token',
        where: 'env',
      },
    ],
  },

  // Productivity
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send messages and manage Slack channels',
    category: 'communication',
    icon: 'slack',
    config: {
      id: 'slack',
      name: 'Slack',
      description: 'Send notifications and read messages from Slack',
      url: 'https://slack-mcp.example.com',
      transport: 'sse',
      enabled: false,
      type: 'user',
    },
    setupInstructions: `
1. Create a Slack App:
   - Go to https://api.slack.com/apps
   - Create new app (From scratch)
   - Add Bot Token Scopes:
     * chat:write
     * channels:read
     * users:read

2. Install to workspace

3. Set environment variable:
   SLACK_BOT_TOKEN=xoxb-your-token

4. Invite bot to channels for posting
    `.trim(),
    requiredEnvVars: [
      {
        name: 'SLACK_BOT_TOKEN',
        description: 'Slack Bot User OAuth Token',
        where: 'env',
      },
    ],
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    description: 'Manage calendar events and schedules',
    category: 'productivity',
    icon: 'calendar',
    config: {
      id: 'google-calendar',
      name: 'Google Calendar',
      description: 'Create and manage calendar events',
      url: 'https://calendar-mcp.example.com',
      transport: 'sse',
      enabled: false,
      type: 'user',
    },
    setupInstructions: `
1. Set up Google Cloud Console:
   - Create a new project or select existing
   - Enable Google Calendar API
   - Create OAuth 2.0 credentials

2. Configure environment variables:
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret

3. First run will open browser for OAuth consent
    `.trim(),
    requiredEnvVars: [
      {
        name: 'GOOGLE_CLIENT_ID',
        description: 'Google OAuth Client ID',
        where: 'env',
      },
      {
        name: 'GOOGLE_CLIENT_SECRET',
        description: 'Google OAuth Client Secret',
        where: 'env',
      },
    ],
  },
]

//=============================================================================
// Provider Registry Functions
//=============================================================================

/**
 * Get all preset providers
 */
export function getPresetProviders(): MCPPresetProvider[] {
  return PRESET_PROVIDERS
}

/**
 * Get providers by category
 */
export function getProvidersByCategory(
  category: MCPPresetProvider['category']
): MCPPresetProvider[] {
  return PRESET_PROVIDERS.filter((p) => p.category === category)
}

/**
 * Get provider by ID
 */
export function getProviderById(id: string): MCPPresetProvider | undefined {
  return PRESET_PROVIDERS.find((p) => p.id === id)
}

/**
 * Convert preset provider to server config
 */
export function providerToConfig(provider: MCPPresetProvider): MCPServerConfig {
  return { ...provider.config }
}

/**
 * Get categories with provider counts
 */
export function getCategoriesWithCount(): Array<{ category: string; count: number }> {
  const counts = PRESET_PROVIDERS.reduce(
    (acc, provider) => {
      acc[provider.category] = (acc[provider.category] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return Object.entries(counts).map(([category, count]) => ({
    category,
    count,
  }))
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(provider: MCPPresetProvider): {
  valid: boolean
  missingVars: string[]
} {
  const missingVars: string[] = []

  for (const envVar of provider.requiredEnvVars) {
    if (envVar.where === 'env') {
      // Would check at runtime if env var is set
      missingVars.push(envVar.name)
    }
  }

  return {
    valid: missingVars.length === 0,
    missingVars,
  }
}

/**
 * Get environment variable template
 */
export function getEnvVarTemplate(provider: MCPPresetProvider): string {
  const lines = ['# Environment variables for ' + provider.name, '']

  for (const envVar of provider.requiredEnvVars) {
    lines.push(`# ${envVar.description}`)
    lines.push(`${envVar.name}=`)
    lines.push('')
  }

  return lines.join('\n')
}

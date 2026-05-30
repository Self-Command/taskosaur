import { TaskType } from '@prisma/client';

export interface MCPToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

const TASK_TYPES = Object.values(TaskType);
const TASK_TYPES_STR = TASK_TYPES.join(',');

export const MCP_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  // ========== WORKSPACE TOOLS ==========
  {
    name: 'list_workspaces',
    description:
      'List all workspaces in an organization. Use this to find workspace IDs and names. / 列出组织中所有工作区。用于查找工作区 ID 和名称。',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (UUID) / 组织 ID',
        },
        search: {
          type: 'string',
          description: 'Search by workspace name / 按名称搜索',
        },
      },
      required: ['organizationId'],
    },
  },
  {
    name: 'get_workspace',
    description:
      'Get details of a specific workspace by ID or slug. / 通过 ID 或 slug 获取工作区详情。',
    input_schema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Workspace ID (UUID) / 工作区 ID',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (required if using slug) / 组织 ID（使用 slug 时必填）',
        },
        slug: {
          type: 'string',
          description: 'Workspace slug (alternative to ID) / 工作区 slug',
        },
      },
    },
  },
  {
    name: 'create_workspace',
    description:
      'Create a new workspace. Name, slug, and organizationId are required. / 创建新工作区。名称、slug 和组织 ID 为必填。',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Workspace name / 工作区名称',
        },
        slug: {
          type: 'string',
          description: 'URL-friendly slug (lowercase, hyphens) / URL 友好的 slug',
        },
        description: {
          type: 'string',
          description: 'Workspace description / 工作区描述',
        },
        color: {
          type: 'string',
          description: 'Hex color code, e.g. #3B82F6 / 十六进制颜色代码',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (UUID) / 组织 ID',
        },
        parentWorkspaceId: {
          type: 'string',
          description: 'Parent workspace ID for nesting / 父工作区 ID',
        },
      },
      required: ['name', 'slug', 'organizationId'],
    },
  },
  {
    name: 'update_workspace',
    description:
      'Update an existing workspace. Provide workspaceId and the fields to change. / 更新工作区。提供工作区 ID 和要修改的字段。',
    input_schema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Workspace ID (UUID) / 工作区 ID',
        },
        name: { type: 'string', description: 'New name / 新名称' },
        description: { type: 'string', description: 'New description / 新描述' },
        color: { type: 'string', description: 'New hex color / 新颜色' },
        avatar: { type: 'string', description: 'Avatar URL / 头像 URL' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'delete_workspace',
    description:
      'Delete a workspace permanently. This cannot be undone. / 永久删除工作区，此操作不可撤销。',
    input_schema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Workspace ID (UUID) / 工作区 ID',
        },
      },
      required: ['workspaceId'],
    },
  },

  // ========== PROJECT TOOLS ==========
  {
    name: 'list_projects',
    description:
      'List all projects in a workspace or organization. / 列出工作区或组织中的所有项目。',
    input_schema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Filter by workspace ID / 按工作区 ID 筛选',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID / 组织 ID',
        },
        search: {
          type: 'string',
          description: 'Search by project name / 按名称搜索',
        },
      },
    },
  },
  {
    name: 'get_project',
    description:
      'Get details of a specific project by ID or slug. / 通过 ID 或 slug 获取项目详情。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (UUID) / 项目 ID',
        },
        slug: {
          type: 'string',
          description: 'Project slug / 项目 slug',
        },
      },
    },
  },
  {
    name: 'create_project',
    description: 'Create a new project in a workspace. / 在工作区中创建新项目。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name / 项目名称' },
        slug: { type: 'string', description: 'URL-friendly slug / URL slug' },
        workspaceId: { type: 'string', description: 'Workspace ID (UUID) / 工作区 ID' },
        description: { type: 'string', description: 'Project description / 项目描述' },
        color: { type: 'string', description: 'Hex color, e.g. #3498db / 颜色' },
        avatar: { type: 'string', description: 'Avatar URL / 头像 URL' },
        taskPrefix: { type: 'string', description: 'Task prefix, e.g. PROJ / 任务前缀' },
        status: {
          type: 'string',
          enum: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
          description: 'Project status / 项目状态',
        },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
          description: 'Project priority / 项目优先级',
        },
        visibility: {
          type: 'string',
          enum: ['PRIVATE', 'INTERNAL', 'PUBLIC'],
          description: 'Visibility level / 可见性',
        },
        startDate: { type: 'string', description: 'Start date (ISO 8601) / 开始日期' },
        endDate: { type: 'string', description: 'End date (ISO 8601) / 结束日期' },
        workflowId: { type: 'string', description: 'Workflow ID (UUID) / 工作流 ID' },
      },
      required: ['name', 'slug', 'workspaceId'],
    },
  },
  {
    name: 'update_project',
    description: 'Update an existing project. Provide projectId and fields to change. / 更新项目。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
        name: { type: 'string', description: 'New name / 新名称' },
        description: { type: 'string', description: 'New description / 新描述' },
        color: { type: 'string', description: 'New color / 新颜色' },
        status: {
          type: 'string',
          enum: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
        },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        },
        visibility: {
          type: 'string',
          enum: ['PRIVATE', 'INTERNAL', 'PUBLIC'],
        },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a project permanently. / 永久删除项目。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
      },
      required: ['projectId'],
    },
  },

  // ========== TASK TOOLS ==========
  {
    name: 'list_tasks',
    description:
      'List tasks with filters (project, workspace, priority, status, type, search). Supports pagination. / 带筛选条件的任务列表。',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', description: 'Organization ID (required) / 组织 ID' },
        projectId: { type: 'string', description: 'Filter by project ID / 按项目 ID 筛选' },
        workspaceId: { type: 'string', description: 'Filter by workspace ID / 按工作区 ID 筛选' },
        priorities: {
          type: 'string',
          description: 'Comma-separated: LOWEST,LOW,MEDIUM,HIGH,HIGHEST / 优先级',
        },
        statuses: { type: 'string', description: 'Comma-separated status IDs / 状态 ID' },
        types: {
          type: 'string',
          description: `Comma-separated: ${TASK_TYPES_STR} / 任务类型`,
        },
        search: { type: 'string', description: 'Search in title/description / 搜索标题/描述' },
        page: { type: 'number', description: 'Page number (default 1) / 页码' },
        limit: { type: 'number', description: 'Items per page (default 20) / 每页条数' },
        sortBy: { type: 'string', description: 'Sort field / 排序字段' },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order / 排序方式' },
      },
      required: ['organizationId'],
    },
  },
  {
    name: 'get_task',
    description:
      'Get full details of a specific task including assignees, status, sprint, labels, comments. / 获取任务完整详情。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
        slug: { type: 'string', description: 'Task slug (e.g. PROJ-123) / 任务 slug' },
      },
    },
  },
  {
    name: 'create_task',
    description:
      'Create a new task in a project. Title, projectId, and statusId are required. / 创建新任务。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title / 任务标题' },
        description: { type: 'string', description: 'Task description (Markdown) / 任务描述' },
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
        statusId: { type: 'string', description: 'Status ID (UUID) / 状态 ID' },
        type: {
          type: 'string',
          enum: TASK_TYPES,
          description: 'Task type / 任务类型',
        },
        priority: {
          type: 'string',
          enum: ['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST'],
          description: 'Priority / 优先级',
        },
        startDate: { type: 'string', description: 'Start date (ISO 8601) / 开始日期' },
        dueDate: { type: 'string', description: 'Due date (ISO 8601) / 截止日期' },
        storyPoints: { type: 'number', description: 'Story points / 故事点' },
        originalEstimate: {
          type: 'number',
          description: 'Time estimate in minutes / 时间估计(分钟)',
        },
        remainingEstimate: {
          type: 'number',
          description: 'Remaining estimate in minutes / 剩余估计',
        },
        sprintId: { type: 'string', description: 'Sprint ID (UUID) / 迭代 ID' },
        parentTaskId: { type: 'string', description: 'Parent task ID for subtasks / 父任务 ID' },
        assigneeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Assignee user IDs / 指派用户 ID',
        },
        reporterIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Reporter user IDs / 报告人 ID',
        },
        customFields: { type: 'object', description: 'Custom fields JSON / 自定义字段' },
      },
      required: ['title', 'projectId', 'statusId'],
    },
  },
  {
    name: 'update_task',
    description:
      'Update any field of an existing task. Provide taskId and the fields to change. / 更新任务任意字段。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
        title: { type: 'string', description: 'New title / 新标题' },
        description: { type: 'string', description: 'New description / 新描述' },
        type: { type: 'string', enum: ['TASK', 'HABIT', 'STUDY', 'WORK', 'LIFE', 'GOAL', 'EVENT', 'NOTE', 'PROJECT', 'SUBTASK'] },
        priority: { type: 'string', enum: ['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST'] },
        statusId: { type: 'string', description: 'New status ID / 新状态 ID' },
        startDate: { type: 'string' },
        dueDate: { type: 'string' },
        completedAt: { type: 'string', description: 'Set to mark as done / 设置为完成时间' },
        storyPoints: { type: 'number' },
        originalEstimate: { type: 'number' },
        remainingEstimate: { type: 'number' },
        sprintId: { type: 'string' },
        parentTaskId: { type: 'string' },
        assigneeIds: { type: 'array', items: { type: 'string' } },
        reporterIds: { type: 'array', items: { type: 'string' } },
        labelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label IDs to set (replaces all existing labels) / 要设置的标签 ID',
        },
        customFields: { type: 'object' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task permanently. / 永久删除任务。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'update_task_status',
    description: 'Change a task status. Requires taskId and statusId. / 更新任务状态。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
        statusId: { type: 'string', description: 'New status ID (UUID) / 新状态 ID' },
      },
      required: ['taskId', 'statusId'],
    },
  },
  {
    name: 'update_task_priority',
    description: 'Change a task priority. / 更新任务优先级。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
        priority: {
          type: 'string',
          enum: ['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST'],
          description: 'New priority / 新优先级',
        },
      },
      required: ['taskId', 'priority'],
    },
  },

  // ========== TASK COMMENT TOOLS ==========
  {
    name: 'list_task_comments',
    description: 'List comments for a task, newest first. / 列出任务评论，按最新排序。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
        page: { type: 'number', description: 'Page number (default 1) / 页码' },
        limit: { type: 'number', description: 'Items per page (default 20) / 每页条数' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'create_task_comment',
    description:
      'Add a comment to a task. Optionally reply to an existing comment. / 为任务添加评论。可选择回复已有评论。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
        content: { type: 'string', description: 'Comment content (Markdown) / 评论内容' },
        parentCommentId: {
          type: 'string',
          description: 'Parent comment ID for threaded replies / 父评论 ID（用于回复）',
        },
      },
      required: ['taskId', 'content'],
    },
  },

  // ========== TASK DEPENDENCY TOOLS ==========
  {
    name: 'list_task_dependencies',
    description:
      'List all dependencies for a task (both blocking and blocked-by). / 列出任务的所有依赖关系。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'add_task_dependency',
    description: 'Create a dependency between two tasks (A blocks B). / 创建任务间的依赖关系。',
    input_schema: {
      type: 'object',
      properties: {
        dependentTaskId: {
          type: 'string',
          description: 'The task being blocked (UUID) / 被阻塞的任务 ID',
        },
        blockingTaskId: {
          type: 'string',
          description: 'The task that blocks it (UUID) / 阻塞任务 ID',
        },
        type: {
          type: 'string',
          enum: ['BLOCKS', 'FINISH_START', 'START_START', 'FINISH_FINISH', 'START_FINISH'],
          description: 'Dependency type (default BLOCKS) / 依赖类型',
        },
      },
      required: ['dependentTaskId', 'blockingTaskId'],
    },
  },
  {
    name: 'remove_task_dependency',
    description: 'Remove a dependency between two tasks. / 移除任务间的依赖关系。',
    input_schema: {
      type: 'object',
      properties: {
        dependentTaskId: {
          type: 'string',
          description: 'The blocked task ID (UUID) / 被阻塞的任务 ID',
        },
        blockingTaskId: {
          type: 'string',
          description: 'The blocking task ID (UUID) / 阻塞任务 ID',
        },
      },
      required: ['dependentTaskId', 'blockingTaskId'],
    },
  },

  // ========== SPRINT TOOLS ==========
  {
    name: 'list_sprints',
    description: 'List sprints for a project. / 列出项目的迭代。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'create_sprint',
    description: 'Create a new sprint in a project. / 在项目中创建新迭代。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Sprint name / 迭代名称' },
        goal: { type: 'string', description: 'Sprint goal / 迭代目标' },
        startDate: { type: 'string', description: 'Start date (ISO 8601) / 开始日期' },
        endDate: { type: 'string', description: 'End date (ISO 8601) / 结束日期' },
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
      },
      required: ['name', 'projectId'],
    },
  },
  {
    name: 'update_sprint',
    description: 'Update an existing sprint. / 更新迭代。',
    input_schema: {
      type: 'object',
      properties: {
        sprintId: { type: 'string', description: 'Sprint ID (UUID) / 迭代 ID' },
        name: { type: 'string', description: 'New name / 新名称' },
        goal: { type: 'string', description: 'New goal / 新目标' },
        status: {
          type: 'string',
          enum: ['PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
          description: 'Sprint status / 迭代状态',
        },
        startDate: { type: 'string', description: 'Start date / 开始日期' },
        endDate: { type: 'string', description: 'End date / 结束日期' },
      },
      required: ['sprintId'],
    },
  },
  {
    name: 'delete_sprint',
    description: 'Delete a sprint permanently. / 永久删除迭代。',
    input_schema: {
      type: 'object',
      properties: {
        sprintId: { type: 'string', description: 'Sprint ID (UUID) / 迭代 ID' },
      },
      required: ['sprintId'],
    },
  },

  // ========== LABEL TOOLS ==========
  {
    name: 'list_labels',
    description: 'List labels for a project. / 列出项目的标签。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'create_label',
    description: 'Create a new label in a project. / 在项目中创建新标签。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Label name / 标签名称' },
        color: { type: 'string', description: 'Hex color, e.g. #EF4444 / 十六进制颜色' },
        description: { type: 'string', description: 'Label description / 标签描述' },
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
      },
      required: ['name', 'color', 'projectId'],
    },
  },
  {
    name: 'update_label',
    description: 'Update an existing label. / 更新标签。',
    input_schema: {
      type: 'object',
      properties: {
        labelId: { type: 'string', description: 'Label ID (UUID) / 标签 ID' },
        name: { type: 'string', description: 'New name / 新名称' },
        color: { type: 'string', description: 'New color / 新颜色' },
        description: { type: 'string', description: 'New description / 新描述' },
      },
      required: ['labelId'],
    },
  },
  {
    name: 'delete_label',
    description: 'Delete a label permanently. / 永久删除标签。',
    input_schema: {
      type: 'object',
      properties: {
        labelId: { type: 'string', description: 'Label ID (UUID) / 标签 ID' },
      },
      required: ['labelId'],
    },
  },

  // ========== WORKFLOW TOOLS ==========
  {
    name: 'list_workflows',
    description: 'List all workflows in an organization. / 列出组织中所有工作流。',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', description: 'Organization ID (UUID) / 组织 ID' },
      },
      required: ['organizationId'],
    },
  },
  {
    name: 'get_workflow',
    description: 'Get workflow details including its statuses. / 获取工作流详情（含状态列表）。',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'Workflow ID (UUID) / 工作流 ID' },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'list_status_transitions',
    description: 'List allowed status transitions in a workflow. / 列出工作流中允许的状态转换。',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'Workflow ID (UUID) / 工作流 ID' },
      },
      required: ['workflowId'],
    },
  },

  // ========== STATUS TOOLS ==========
  {
    name: 'list_task_statuses',
    description: 'List available task statuses for a workflow. / 列出工作流中可用的任务状态。',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'Workflow ID (UUID) / 工作流 ID' },
      },
      required: ['workflowId'],
    },
  },

  // ========== USER TOOLS ==========
  {
    name: 'list_project_members',
    description:
      'List members of a project (for assigning tasks). / 列出项目成员（用于指派任务）。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'list_workspace_members',
    description: 'List members of a workspace. / 列出工作区成员。',
    input_schema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID (UUID) / 工作区 ID' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'add_workspace_member',
    description: 'Add a user to a workspace with a role. / 将用户添加到工作区。',
    input_schema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID (UUID) / 工作区 ID' },
        userId: { type: 'string', description: 'User ID (UUID) / 用户 ID' },
        role: {
          type: 'string',
          enum: ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'],
          description: 'Role / 角色',
        },
      },
      required: ['workspaceId', 'userId'],
    },
  },
  {
    name: 'remove_workspace_member',
    description: 'Remove a user from a workspace. / 从工作区移除用户。',
    input_schema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID (UUID) / 工作区 ID' },
        userId: { type: 'string', description: 'User ID (UUID) / 用户 ID' },
      },
      required: ['workspaceId', 'userId'],
    },
  },
  {
    name: 'add_project_member',
    description: 'Add a user to a project with a role. / 将用户添加到项目。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
        userId: { type: 'string', description: 'User ID (UUID) / 用户 ID' },
        role: {
          type: 'string',
          enum: ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'],
          description: 'Role (default MEMBER) / 角色',
        },
      },
      required: ['projectId', 'userId'],
    },
  },
  {
    name: 'remove_project_member',
    description: 'Remove a user from a project. / 从项目移除用户。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
        userId: { type: 'string', description: 'User ID (UUID) / 用户 ID' },
      },
      required: ['projectId', 'userId'],
    },
  },
  {
    name: 'update_project_member_role',
    description: 'Change a project member role. / 更改项目成员角色。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
        userId: { type: 'string', description: 'User ID (UUID) / 用户 ID' },
        role: {
          type: 'string',
          enum: ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'],
          description: 'New role / 新角色',
        },
      },
      required: ['projectId', 'userId', 'role'],
    },
  },

  // ========== CUSTOM FIELD TOOLS ==========
  {
    name: 'list_custom_fields',
    description: 'List custom fields defined for an organization. / 列出组织定义的自定义字段。',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', description: 'Organization ID (UUID) / 组织 ID' },
      },
      required: ['organizationId'],
    },
  },
  {
    name: 'get_custom_field',
    description: 'Get details of a specific custom field. / 获取特定自定义字段的详细信息。',
    input_schema: {
      type: 'object',
      properties: {
        customFieldId: { type: 'string', description: 'Custom Field ID (UUID) / 自定义字段 ID' },
      },
      required: ['customFieldId'],
    },
  },

  // ========== TIME ENTRY TOOLS ==========
  {
    name: 'list_time_entries',
    description: 'List time entries for a task or user. / 列出任务或用户的时间记录。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Filter by task ID (UUID) / 按任务 ID 筛选' },
        projectId: {
          type: 'string',
          description: 'Filter tasks by project ID (UUID) / 按项目筛选所有任务',
        },
        page: { type: 'number', description: 'Page number (default 1) / 页码' },
        limit: { type: 'number', description: 'Items per page (default 20) / 每页条数' },
      },
    },
  },
  {
    name: 'create_time_entry',
    description: 'Log time spent on a task (in minutes). / 记录任务耗时（分钟）。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
        description: { type: 'string', description: 'Work description / 工作描述' },
        timeSpent: { type: 'number', description: 'Time spent in minutes / 耗时（分钟）' },
        startTime: { type: 'string', description: 'Start time (ISO 8601) / 开始时间' },
        endTime: { type: 'string', description: 'End time (ISO 8601) / 结束时间' },
        date: { type: 'string', description: 'Date of work (default today) / 工作日期' },
      },
      required: ['taskId', 'timeSpent'],
    },
  },
  {
    name: 'delete_time_entry',
    description: 'Delete a time entry permanently. / 永久删除时间记录。',
    input_schema: {
      type: 'object',
      properties: {
        timeEntryId: { type: 'string', description: 'Time Entry ID (UUID) / 时间记录 ID' },
      },
      required: ['timeEntryId'],
    },
  },

  // ========== INVITATION TOOLS ==========
  {
    name: 'list_invitations',
    description:
      'List pending invitations for an organization, workspace, or project. / 列出待处理的邀请。',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', description: 'Filter by organization ID / 按组织筛选' },
        workspaceId: { type: 'string', description: 'Filter by workspace ID / 按工作区筛选' },
        projectId: { type: 'string', description: 'Filter by project ID / 按项目筛选' },
        status: {
          type: 'string',
          enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
          description: 'Filter by status / 按状态筛选',
        },
      },
    },
  },
  {
    name: 'create_invitation',
    description:
      'Invite a user by email to an organization, workspace, or project. / 通过电子邮件邀请用户加入组织、工作区或项目。',
    input_schema: {
      type: 'object',
      properties: {
        inviteeEmail: { type: 'string', description: 'Email to invite / 被邀请人邮箱' },
        role: { type: 'string', description: 'Role to assign / 分配的角色' },
        organizationId: { type: 'string', description: 'Organization ID (UUID) / 组织 ID' },
        workspaceId: { type: 'string', description: 'Workspace ID (UUID) / 工作区 ID' },
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
      },
      required: ['inviteeEmail', 'role'],
    },
  },

  // ========== NOTIFICATION TOOLS ==========
  {
    name: 'list_notifications',
    description: 'List notifications for the current user. / 列出当前用户的通知。',
    input_schema: {
      type: 'object',
      properties: {
        isRead: { type: 'boolean', description: 'Filter read/unread / 筛选已读/未读' },
        page: { type: 'number', description: 'Page number (default 1) / 页码' },
        limit: { type: 'number', description: 'Items per page (default 20) / 每页条数' },
      },
    },
  },
  {
    name: 'mark_notification_read',
    description: 'Mark a notification as read. / 将通知标记为已读。',
    input_schema: {
      type: 'object',
      properties: {
        notificationId: { type: 'string', description: 'Notification ID (UUID) / 通知 ID' },
      },
      required: ['notificationId'],
    },
  },

  // ========== RECURRING TASK TOOLS ==========
  {
    name: 'get_task_recurrence',
    description: 'Get the recurrence configuration for a recurring task. / 获取任务重复配置。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'disable_task_recurrence',
    description: 'Stop a task from recurring. / 停止任务重复。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
      },
      required: ['taskId'],
    },
  },

  // ========== PUBLIC TASK SHARE TOOLS ==========
  {
    name: 'list_task_shares',
    description: 'List public share links for a task. / 列出任务的公开分享链接。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'share_task_publicly',
    description: 'Create a public share link for a task. / 创建任务的公开分享链接。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
        expiresAt: {
          type: 'string',
          description: 'Expiration date (ISO 8601, default 30 days) / 过期时间',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'revoke_task_share',
    description: 'Revoke a public task share link. / 撤销公开任务分享链接。',
    input_schema: {
      type: 'object',
      properties: {
        shareId: { type: 'string', description: 'Share ID (UUID) / 分享 ID' },
      },
      required: ['shareId'],
    },
  },

  // ========== TASK ATTACHMENT TOOLS ==========
  {
    name: 'list_task_attachments',
    description: 'List file attachments for a task. / 列出任务的文件附件。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (UUID) / 任务 ID' },
      },
      required: ['taskId'],
    },
  },

  // ========== AUTOMATION RULE TOOLS ==========
  {
    name: 'list_automation_rules',
    description:
      'List automation rules. Filter by project, workspace, or organization. / 列出自动化规则。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Filter by project ID / 按项目筛选' },
        workspaceId: { type: 'string', description: 'Filter by workspace ID / 按工作区筛选' },
        organizationId: { type: 'string', description: 'Filter by organization ID / 按组织筛选' },
      },
    },
  },

  // ========== NAVIGATION ==========
  {
    name: 'navigate',
    description:
      'Tell the frontend to navigate to a specific page. Use this after creating/updating entities to navigate the user. / 让前端导航到特定页面。',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'URL path to navigate to, e.g. /workspace-slug/project-slug / 要导航的 URL 路径',
        },
      },
      required: ['path'],
    },
  },

  // ========== ORGANIZATION TOOLS ==========
  {
    name: 'list_organizations',
    description: 'List all organizations the user belongs to. / 列出用户属于的所有组织。',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_organization',
    description: 'Get organization details by ID. / 根据ID获取组织详情。',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', description: 'Organization ID (UUID) / 组织 ID' },
      },
      required: ['organizationId'],
    },
  },
  {
    name: 'update_organization',
    description:
      'Update an organization name, description, or website. / 更新组织名称、描述或网站。',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', description: 'Organization ID (UUID) / 组织 ID' },
        name: { type: 'string', description: 'New name / 新名称' },
        description: { type: 'string', description: 'New description / 新描述' },
        website: { type: 'string', description: 'New website URL / 新网站 URL' },
      },
      required: ['organizationId'],
    },
  },
  {
    name: 'list_organization_members',
    description: 'List all members of an organization. / 列出组织所有成员。',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', description: 'Organization ID (UUID) / 组织 ID' },
      },
      required: ['organizationId'],
    },
  },

  // ========== WORKSPACE MEMBER EXTENDED ==========
  {
    name: 'update_workspace_member_role',
    description: 'Change a workspace member role. / 更改工作区成员角色。',
    input_schema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID (UUID) / 工作区 ID' },
        userId: { type: 'string', description: 'User ID (UUID) / 用户 ID' },
        role: {
          type: 'string',
          enum: ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'],
          description: 'New role / 新角色',
        },
      },
      required: ['workspaceId', 'userId', 'role'],
    },
  },

  // ========== SETTINGS TOOLS ==========
  {
    name: 'list_settings',
    description: 'List settings, optionally filtered by category. / 列出系统设置。',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category, e.g. "general", "ai", "email" / 按类别筛选',
        },
      },
    },
  },
  {
    name: 'get_setting',
    description: 'Get a specific setting value by key. / 通过键获取设置值。',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Setting key / 设置键名' },
      },
      required: ['key'],
    },
  },
  {
    name: 'update_setting',
    description:
      'Update a setting value by key. Cannot update encrypted settings. / 更新设置值（不能更新加密设置）。',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Setting key / 设置键名' },
        value: { type: 'string', description: 'New value / 新值' },
      },
      required: ['key', 'value'],
    },
  },

  // ========== USER TOOLS EXTENDED ==========
  {
    name: 'list_users',
    description: 'List users in an organization or workspace. / 列出组织或工作区中的用户。',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', description: 'Organization ID (UUID) / 组织 ID' },
        workspaceId: { type: 'string', description: 'Workspace ID (UUID) / 工作区 ID' },
        search: { type: 'string', description: 'Search by name or email / 按名称或邮箱搜索' },
      },
    },
  },
  {
    name: 'get_user',
    description: 'Get basic user profile by ID. / 通过 ID 获取用户基本信息。',
    input_schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID (UUID) / 用户 ID' },
      },
      required: ['userId'],
    },
  },

  // ========== INBOX TOOLS ==========
  {
    name: 'get_project_inbox',
    description: 'Get the inbox configuration for a project. / 获取项目收件箱配置。',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'list_inbox_rules',
    description: 'List inbox processing rules for a project inbox. / 列出项目收件箱的处理规则。',
    input_schema: {
      type: 'object',
      properties: {
        projectInboxId: { type: 'string', description: 'Project Inbox ID (UUID) / 收件箱 ID' },
      },
      required: ['projectInboxId'],
    },
  },
  {
    name: 'list_inbox_messages',
    description:
      'List incoming email messages for a project inbox (read-only). / 列出项目收件箱的邮件（只读）。',
    input_schema: {
      type: 'object',
      properties: {
        projectInboxId: { type: 'string', description: 'Project Inbox ID (UUID) / 收件箱 ID' },
        status: {
          type: 'string',
          enum: ['PENDING', 'PROCESSING', 'CONVERTED', 'IGNORED', 'FAILED'],
          description: 'Filter by status / 按状态筛选',
        },
        page: { type: 'number', description: 'Page number / 页码' },
        limit: { type: 'number', description: 'Items per page / 每页条数' },
      },
      required: ['projectInboxId'],
    },
  },

  // ========== AUTOMATION RULE EXTENDED ==========
  {
    name: 'create_automation_rule',
    description: 'Create a new automation rule. / 创建新的自动化规则。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Rule name / 规则名称' },
        triggerType: {
          type: 'string',
          enum: [
            'TASK_CREATED',
            'TASK_UPDATED',
            'TASK_STATUS_CHANGED',
            'TASK_ASSIGNED',
            'TASK_DUE_DATE_APPROACHING',
            'TASK_OVERDUE',
            'SPRINT_STARTED',
            'SPRINT_COMPLETED',
            'PROJECT_CREATED',
            'COMMENT_ADDED',
          ],
          description: 'Trigger event / 触发事件',
        },
        actionType: {
          type: 'string',
          enum: [
            'ASSIGN_TASK',
            'CHANGE_STATUS',
            'ADD_LABEL',
            'REMOVE_LABEL',
            'SET_DUE_DATE',
            'SEND_NOTIFICATION',
            'SEND_EMAIL',
            'ADD_COMMENT',
            'MOVE_TO_SPRINT',
            'CHANGE_PRIORITY',
          ],
          description: 'Action to perform / 执行动作',
        },
        projectId: { type: 'string', description: 'Project ID (UUID) / 项目 ID' },
        workspaceId: { type: 'string', description: 'Workspace ID (UUID) / 工作区 ID' },
        organizationId: { type: 'string', description: 'Organization ID (UUID) / 组织 ID' },
        triggerConfig: { type: 'object', description: 'Trigger config JSON / 触发器配置' },
        actionConfig: { type: 'object', description: 'Action config JSON / 动作配置' },
      },
      required: ['name', 'triggerType', 'actionType'],
    },
  },
  {
    name: 'toggle_automation_rule',
    description: 'Enable or disable an automation rule. / 启用或禁用自动化规则。',
    input_schema: {
      type: 'object',
      properties: {
        ruleId: { type: 'string', description: 'Rule ID (UUID) / 规则 ID' },
        enabled: { type: 'boolean', description: 'true = enable, false = disable / 启用或禁用' },
      },
      required: ['ruleId', 'enabled'],
    },
  },

  // ========== ACTIVITY LOG TOOLS ==========
  {
    name: 'list_activity_logs',
    description:
      'List activity/audit logs with optional filters. Read-only. / 列出活动日志（只读）。',
    input_schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', description: 'Filter by organization / 按组织筛选' },
        projectId: { type: 'string', description: 'Filter by project / 按项目筛选' },
        entityType: {
          type: 'string',
          description: 'Filter by entity type (Task, Project, etc.) / 按实体类型筛选',
        },
        page: { type: 'number', description: 'Page number (default 1) / 页码' },
        limit: { type: 'number', description: 'Items per page (default 20) / 每页条数' },
      },
    },
  },
];

export function getToolDefinitions(): MCPToolDefinition[] {
  return MCP_TOOL_DEFINITIONS;
}

export function getToolByName(name: string): MCPToolDefinition | undefined {
  return MCP_TOOL_DEFINITIONS.find((t) => t.name === name);
}

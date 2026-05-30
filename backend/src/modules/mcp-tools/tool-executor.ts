import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskType } from '@prisma/client';
import slugify from 'slugify';
import * as crypto from 'crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fields to strip before sending results to LLM (internal/noise)
const STRIP_FIELDS = new Set([
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'archive',
  'isArchived',
  'avatar',
  'path',
  'settings',
  'parentWorkspaceId',
  'taskPrefix',
  'taskNumber',
  'visibility',
  'isDefault',
  'position',
]);

function trimForLLM(obj: any, depth = 0): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    const cap = depth === 0 ? 20 : 5;
    return obj.slice(0, cap).map((item) => trimForLLM(item, depth + 1));
  }
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (STRIP_FIELDS.has(k)) continue;
    if (k === '_count') {
      // Flatten _count to a simple number summary
      const counts = v as Record<string, number>;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total > 0) out.totalItems = total;
      continue;
    }
    if (k === 'organizationId' && depth > 0) continue; // redundant in nested objects
    if (k === 'workspaceId' && depth > 0) continue;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      // For nested objects (like project inside task), only keep id + name
      if (depth >= 1 && 'id' in v && 'name' in v) {
        out[k] = { id: v.id, name: v.name };
        continue;
      }
      out[k] = trimForLLM(v, depth + 1);
    } else {
      out[k] = trimForLLM(v, depth);
    }
  }
  return out;
}

@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(private prisma: PrismaService) {}

  // ---- helpers ----
  private requireString(v: unknown, name: string): string | null {
    if (typeof v !== 'string' || !v.trim()) return `${name} must be a non-empty string`;
    return null;
  }
  private requireUUID(v: unknown, name: string): string | null {
    const s = this.requireString(v, name);
    if (s) return s;
    if (!UUID_RE.test(v as string))
      return `${name} must be a valid UUID (got "${v}"). Use list_* tools first to find the correct ID.`;
    return null;
  }
  private safeDate(v: unknown): Date | null {
    if (!v) return null;
    const d = new Date(v as string);
    return isNaN(d.getTime()) ? null : d;
  }
  private safeNullable(v: unknown): any | null {
    return v === undefined || v === null || v === '' ? null : v;
  }

  /** Validate task type against Prisma enum. Returns null if valid, error message if invalid. */
  private validateTaskType(type?: string): string | null {
    if (!type) return null;
    const upper = type.toUpperCase();
    if (!Object.values(TaskType).includes(upper as TaskType)) {
      return `Invalid task type "${type}". Valid types: ${Object.values(TaskType).join(', ')}`;
    }
    return null;
  }

  private catchError(tool: string, params: Record<string, any>, err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('Invalid') && msg.includes('UUID')) {
      const field = msg.includes('workflowId')
        ? 'workflowId'
        : msg.includes('workspaceId')
          ? 'workspaceId'
          : msg.includes('projectId')
            ? 'projectId'
            : msg.includes('taskId')
              ? 'taskId'
              : msg.includes('organizationId')
                ? 'organizationId'
                : 'ID';
      return {
        success: false,
        error: `Invalid UUID for ${field}. You must use list_* tools first to find the correct UUID. Do NOT make up IDs.`,
      };
    }
    if (
      msg.includes('Record to delete does not exist') ||
      msg.includes('Record to update not found')
    ) {
      return {
        success: false,
        error:
          'Resource not found. It may have been deleted already. Use list_* tools to find existing resources.',
      };
    }
    if (msg.includes('Unique constraint')) {
      return {
        success: false,
        error: 'A resource with this name/slug already exists. Use a different name.',
      };
    }
    if (msg.includes('Foreign key constraint')) {
      return {
        success: false,
        error:
          'Referenced parent resource does not exist. Check the parent ID with list_* tools first.',
      };
    }
    this.logger.error(`[${tool}] ${msg}`);
    return {
      success: false,
      error: msg.includes('prisma')
        ? `Database error. Check that all IDs are valid UUIDs obtained from list_* tools.`
        : msg,
    };
  }

  async execute(toolName: string, params: Record<string, any>, userId: string): Promise<any> {
    try {
      switch (toolName) {
        // Workspace
        case 'list_workspaces':
          return trimForLLM(await this.listWorkspaces(params, userId));
        case 'get_workspace':
          return trimForLLM(await this.getWorkspace(params, userId));
        case 'create_workspace':
          return trimForLLM(await this.createWorkspace(params, userId));
        case 'update_workspace':
          return trimForLLM(await this.updateWorkspace(params, userId));
        case 'delete_workspace':
          return await this.deleteWorkspace(params, userId);
        // Project
        case 'list_projects':
          return trimForLLM(await this.listProjects(params, userId));
        case 'get_project':
          return trimForLLM(await this.getProject(params, userId));
        case 'create_project':
          return trimForLLM(await this.createProject(params, userId));
        case 'update_project':
          return trimForLLM(await this.updateProject(params, userId));
        case 'delete_project':
          return await this.deleteProject(params, userId);
        // Task
        case 'list_tasks':
          return trimForLLM(await this.listTasks(params, userId));
        case 'get_task':
          return trimForLLM(await this.getTask(params, userId));
        case 'create_task':
          return trimForLLM(await this.createTask(params, userId));
        case 'update_task':
          return trimForLLM(await this.updateTask(params, userId));
        case 'delete_task':
          return await this.deleteTask(params, userId);
        case 'update_task_status':
          return trimForLLM(await this.updateTaskStatus(params, userId));
        case 'update_task_priority':
          return trimForLLM(await this.updateTaskPriority(params, userId));
        // Comment
        case 'list_task_comments':
          return trimForLLM(await this.listTaskComments(params, userId));
        case 'create_task_comment':
          return trimForLLM(await this.createTaskComment(params, userId));
        // Dependency
        case 'list_task_dependencies':
          return trimForLLM(await this.listTaskDependencies(params, userId));
        case 'add_task_dependency':
          return trimForLLM(await this.addTaskDependency(params, userId));
        case 'remove_task_dependency':
          return await this.removeTaskDependency(params, userId);
        // Sprint
        case 'list_sprints':
          return trimForLLM(await this.listSprints(params, userId));
        case 'create_sprint':
          return trimForLLM(await this.createSprint(params, userId));
        case 'update_sprint':
          return trimForLLM(await this.updateSprint(params, userId));
        case 'delete_sprint':
          return await this.deleteSprint(params, userId);
        // Label
        case 'list_labels':
          return trimForLLM(await this.listLabels(params, userId));
        case 'create_label':
          return trimForLLM(await this.createLabel(params, userId));
        case 'update_label':
          return trimForLLM(await this.updateLabel(params, userId));
        case 'delete_label':
          return await this.deleteLabel(params, userId);
        // Time Entry
        case 'list_time_entries':
          return trimForLLM(await this.listTimeEntries(params, userId));
        case 'create_time_entry':
          return trimForLLM(await this.createTimeEntry(params, userId));
        case 'delete_time_entry':
          return await this.deleteTimeEntry(params, userId);
        // Member
        case 'list_workspace_members':
          return trimForLLM(await this.listWorkspaceMembers(params, userId));
        case 'add_workspace_member':
          return trimForLLM(await this.addWorkspaceMember(params, userId));
        case 'remove_workspace_member':
          return await this.removeWorkspaceMember(params, userId);
        case 'add_project_member':
          return trimForLLM(await this.addProjectMember(params, userId));
        case 'remove_project_member':
          return await this.removeProjectMember(params, userId);
        case 'update_project_member_role':
          return trimForLLM(await this.updateProjectMemberRole(params, userId));
        // Invitation
        case 'list_invitations':
          return trimForLLM(await this.listInvitations(params, userId));
        case 'create_invitation':
          return trimForLLM(await this.createInvitation(params, userId));
        // Notification
        case 'list_notifications':
          return trimForLLM(await this.listNotifications(params, userId));
        case 'mark_notification_read':
          return trimForLLM(await this.markNotificationRead(params, userId));
        // Workflow
        case 'list_workflows':
          return trimForLLM(await this.listWorkflows(params, userId));
        case 'get_workflow':
          return trimForLLM(await this.getWorkflow(params, userId));
        case 'list_status_transitions':
          return trimForLLM(await this.listStatusTransitions(params, userId));
        // Custom Field
        case 'list_custom_fields':
          return trimForLLM(await this.listCustomFields(params, userId));
        case 'get_custom_field':
          return trimForLLM(await this.getCustomField(params, userId));
        // Recurrence
        case 'get_task_recurrence':
          return trimForLLM(await this.getTaskRecurrence(params, userId));
        case 'disable_task_recurrence':
          return trimForLLM(await this.disableTaskRecurrence(params, userId));
        // Public Share
        case 'list_task_shares':
          return trimForLLM(await this.listTaskShares(params, userId));
        case 'share_task_publicly':
          return trimForLLM(await this.shareTaskPublicly(params, userId));
        case 'revoke_task_share':
          return trimForLLM(await this.revokeTaskShare(params, userId));
        // Attachment
        case 'list_task_attachments':
          return trimForLLM(await this.listTaskAttachments(params, userId));
        // Automation
        case 'list_automation_rules':
          return trimForLLM(await this.listAutomationRules(params, userId));
        case 'create_automation_rule':
          return trimForLLM(await this.createAutomationRule(params, userId));
        case 'toggle_automation_rule':
          return trimForLLM(await this.toggleAutomationRule(params, userId));
        // User
        case 'list_users':
          return trimForLLM(await this.listUsers(params, userId));
        case 'get_user':
          return trimForLLM(await this.getUser(params, userId));
        // Inbox
        case 'get_project_inbox':
          return trimForLLM(await this.getProjectInbox(params, userId));
        case 'list_inbox_rules':
          return trimForLLM(await this.listInboxRules(params, userId));
        case 'list_inbox_messages':
          return trimForLLM(await this.listInboxMessages(params, userId));
        // Organization
        case 'get_organization':
          return trimForLLM(await this.getOrganization(params, userId));
        case 'update_organization':
          return trimForLLM(await this.updateOrganization(params, userId));
        case 'list_organization_members':
          return trimForLLM(await this.listOrganizationMembers(params, userId));
        // Workspace Member
        case 'update_workspace_member_role':
          return trimForLLM(await this.updateWorkspaceMemberRole(params, userId));
        // Settings
        case 'list_settings':
          return trimForLLM(await this.listSettings(params, userId));
        case 'get_setting':
          return trimForLLM(await this.getSetting(params, userId));
        case 'update_setting':
          return trimForLLM(await this.updateSetting(params, userId));
        // Activity
        case 'list_activity_logs':
          return trimForLLM(await this.listActivityLogs(params, userId));
        // Other
        case 'list_task_statuses':
          return trimForLLM(await this.listTaskStatuses(params, userId));
        case 'list_project_members':
          return trimForLLM(await this.listProjectMembers(params, userId));
        case 'list_organizations':
          return trimForLLM(await this.listOrganizations(userId));
        case 'navigate':
          return { success: true, path: params.path, action: 'navigate' };
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error: any) {
      return this.catchError(toolName, params, error);
    }
  }

  // ========== WORKSPACE ==========

  private async listWorkspaces(params: Record<string, any>, userId: string) {
    const where: any = { archive: false };
    if (params.organizationId) where.organizationId = params.organizationId;
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' as const };
    const workspaces = await this.prisma.workspace.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color: true,
        organizationId: true,
        parentWorkspaceId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { projects: true, members: true } },
      },
    });
    return { success: true, count: workspaces.length, workspaces };
  }

  private async getWorkspace(params: Record<string, any>, userId: string) {
    let workspace;
    if (params.workspaceId) {
      workspace = await this.prisma.workspace.findUnique({
        where: { id: params.workspaceId },
        include: {
          _count: { select: { projects: true, members: true, childWorkspaces: true } },
          projects: { select: { id: true, name: true, slug: true, status: true }, take: 20 },
        },
      });
    } else if (params.slug && params.organizationId) {
      workspace = await this.prisma.workspace.findUnique({
        where: {
          organizationId_slug: { organizationId: params.organizationId, slug: params.slug },
        },
        include: {
          _count: { select: { projects: true, members: true, childWorkspaces: true } },
          projects: { select: { id: true, name: true, slug: true, status: true }, take: 20 },
        },
      });
    }
    if (!workspace)
      return {
        success: false,
        error: `Workspace not found (query: id="${params.workspaceId}", slug="${params.slug}", orgId="${params.organizationId}"). Use list_workspaces first.`,
      };
    return { success: true, workspace };
  }

  private async createWorkspace(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.organizationId, 'organizationId') ||
      this.requireString(params.name, 'name');
    if (err) return { success: false, error: err };
    const slug = params.slug || slugify(params.name, { lower: true, strict: true });
    const org = await this.prisma.organization.findUnique({
      where: { id: params.organizationId },
      select: { id: true },
    });
    if (!org)
      return {
        success: false,
        error: `Organization not found with ID "${params.organizationId}". Use list_organizations to find your organization.`,
      };
    const workspace = await this.prisma.workspace.create({
      data: {
        name: params.name,
        slug,
        description: params.description || `Workspace for ${params.name}`,
        color: params.color || '#3B82F6',
        organizationId: params.organizationId,
        parentWorkspaceId: this.safeNullable(params.parentWorkspaceId),
        createdBy: userId,
        updatedBy: userId,
        members: { create: { userId, role: 'OWNER' } },
      },
      include: { _count: { select: { projects: true } } },
    });
    return {
      success: true,
      workspace,
      message: `Workspace "${workspace.name}" created successfully`,
    };
  }

  private async updateWorkspace(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.workspaceId, 'workspaceId');
    if (err) return { success: false, error: err };
    const { workspaceId, ...data } = params;
    const updateData: any = { updatedBy: userId };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    const workspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
    });
    return { success: true, workspace, message: `Workspace "${workspace.name}" updated` };
  }

  private async deleteWorkspace(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.workspaceId, 'workspaceId');
    if (err) return { success: false, error: err };
    const ws = await this.prisma.workspace.findUnique({
      where: { id: params.workspaceId },
      select: { name: true },
    });
    if (!ws)
      return { success: false, error: `Workspace not found. It may have been deleted already.` };
    await this.prisma.workspace.delete({ where: { id: params.workspaceId } });
    return { success: true, message: `Workspace "${ws.name}" deleted successfully` };
  }

  // ========== PROJECT ==========

  private async listProjects(params: Record<string, any>, userId: string) {
    const where: any = { archive: false };
    if (params.workspaceId) where.workspaceId = params.workspaceId;
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' as const };
    if (params.organizationId && !params.workspaceId) {
      const wsIds = await this.prisma.workspace.findMany({
        where: { organizationId: params.organizationId, archive: false },
        select: { id: true },
      });
      where.workspaceId = { in: wsIds.map((w) => w.id) };
    }
    const projects = await this.prisma.project.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color: true,
        status: true,
        priority: true,
        visibility: true,
        workspaceId: true,
        taskPrefix: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        _count: { select: { tasks: true, members: true } },
      },
    });
    return { success: true, count: projects.length, projects };
  }

  private async getProject(params: Record<string, any>, userId: string) {
    let project;
    if (params.projectId) {
      project = await this.prisma.project.findUnique({
        where: { id: params.projectId },
        include: {
          _count: { select: { tasks: true, members: true, sprints: true, labels: true } },
          workflow: { select: { id: true, name: true } },
        },
      });
    } else if (params.slug && params.workspaceId) {
      project = await this.prisma.project.findFirst({
        where: { slug: params.slug, workspaceId: params.workspaceId },
        include: {
          _count: { select: { tasks: true, members: true, sprints: true, labels: true } },
          workflow: { select: { id: true, name: true } },
        },
      });
    }
    if (!project)
      return {
        success: false,
        error:
          'Project not found. Use list_projects with the workspaceId to find available projects.',
      };
    return { success: true, project };
  }

  private async createProject(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.workspaceId, 'workspaceId') ||
      this.requireString(params.name, 'name');
    if (err) return { success: false, error: err };
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: params.workspaceId },
      select: { id: true, organizationId: true },
    });
    if (!workspace)
      return {
        success: false,
        error: `Workspace not found (id="${params.workspaceId}"). Use list_workspaces first to get a valid workspace ID.`,
      };

    const defaultWorkflow = await this.prisma.workflow.findFirst({
      where: { organizationId: workspace.organizationId, isDefault: true },
      select: { id: true },
    });
    const words = params.name.split(/[\s-]+/).filter(Boolean);
    let taskPrefix =
      words.length > 1
        ? words.map((w: string) => w.charAt(0)).join('')
        : params.name.substring(0, 4);
    taskPrefix = (params.taskPrefix || taskPrefix).substring(0, 8).toUpperCase();
    const slug = params.slug || slugify(params.name, { lower: true, strict: true });

    const project = await this.prisma.project.create({
      data: {
        name: params.name,
        slug,
        description: params.description || '',
        color: params.color || '#3498db',
        taskPrefix,
        status: params.status || 'PLANNING',
        priority: params.priority || 'MEDIUM',
        visibility: params.visibility || 'PRIVATE',
        startDate: this.safeDate(params.startDate),
        endDate: this.safeDate(params.endDate),
        workspaceId: params.workspaceId,
        workflowId: params.workflowId || defaultWorkflow?.id,
        createdBy: userId,
        updatedBy: userId,
        members: { create: { userId, role: 'OWNER' } },
      },
      include: { workspace: { select: { name: true, slug: true } } },
    });
    return {
      success: true,
      project,
      message: `Project "${project.name}" created in workspace "${project.workspace.name}"`,
    };
  }

  private async updateProject(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.projectId, 'projectId');
    if (err) return { success: false, error: err };
    const { projectId, ...data } = params;
    const updateData: any = { updatedBy: userId };
    const fields = [
      'name',
      'description',
      'color',
      'status',
      'priority',
      'visibility',
      'startDate',
      'endDate',
    ];
    for (const f of fields) {
      if (data[f] !== undefined)
        updateData[f] = f.endsWith('Date') ? this.safeDate(data[f]) : data[f];
    }
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: updateData,
    });
    return { success: true, project, message: `Project "${project.name}" updated` };
  }

  private async deleteProject(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.projectId, 'projectId');
    if (err) return { success: false, error: err };
    const p = await this.prisma.project.findUnique({
      where: { id: params.projectId },
      select: { name: true },
    });
    if (!p)
      return { success: false, error: 'Project not found. It may have been deleted already.' };
    await this.prisma.project.delete({ where: { id: params.projectId } });
    return { success: true, message: `Project "${p.name}" deleted successfully` };
  }

  // ========== TASK ==========

  private async listTasks(params: Record<string, any>, userId: string) {
    const where: any = { isArchived: false };
    if (params.projectId) where.projectId = params.projectId;
    if (params.workspaceId) {
      const pids = await this.prisma.project.findMany({
        where: { workspaceId: params.workspaceId },
        select: { id: true },
      });
      where.projectId = { in: pids.map((p) => p.id) };
    }
    if (params.priorities)
      where.priority = {
        in: params.priorities.split(',').map((p: string) => p.trim().toUpperCase()),
      };
    if (params.types)
      where.type = { in: params.types.split(',').map((p: string) => p.trim().toUpperCase()) };
    if (params.statuses)
      where.statusId = { in: params.statuses.split(',').map((s: string) => s.trim()) };
    if (params.search)
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' as const } },
        { description: { contains: params.search, mode: 'insensitive' as const } },
      ];
    const page = Math.max(1, +(params.page || 1));
    const limit = Math.min(100, Math.max(1, +(params.limit || 20)));
    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          slug: true,
          taskNumber: true,
          type: true,
          priority: true,
          statusId: true,
          startDate: true,
          dueDate: true,
          completedAt: true,
          storyPoints: true,
          projectId: true,
          createdAt: true,
          project: { select: { id: true, name: true, slug: true, taskPrefix: true } },
          status: { select: { id: true, name: true, color: true, category: true } },
          assignees: {
            select: {
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      success: true,
      count: tasks.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      tasks,
    };
  }

  private async getTask(params: Record<string, any>, userId: string) {
    let task;
    const include = {
      project: { select: { id: true, name: true, slug: true, taskPrefix: true } },
      status: { select: { id: true, name: true, color: true, category: true } },
      sprint: { select: { id: true, name: true, status: true } },
      assignees: {
        select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
      reporters: {
        select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
      labels: { select: { label: { select: { id: true, name: true, color: true } } } },
      comments: {
        select: { id: true, content: true, authorId: true, createdAt: true },
        orderBy: { createdAt: 'desc' as const },
        take: 10,
      },
      _count: { select: { childTasks: true, comments: true, attachments: true } },
    };
    if (params.taskId) {
      task = await this.prisma.task.findUnique({ where: { id: params.taskId }, include });
    } else if (params.slug) {
      task = await this.prisma.task.findFirst({ where: { slug: params.slug }, include });
    }
    if (!task)
      return { success: false, error: 'Task not found. Use list_tasks to find available tasks.' };
    return { success: true, task };
  }

  private async createTask(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.projectId, 'projectId') ||
      this.requireString(params.title, 'title') ||
      this.requireUUID(params.statusId, 'statusId');
    if (err) return { success: false, error: err };
    const project = await this.prisma.project.findUnique({
      where: { id: params.projectId },
      select: {
        id: true,
        taskPrefix: true,
        workflow: { select: { id: true } },
        _count: { select: { tasks: true } },
      },
    });
    if (!project) return { success: false, error: `Project not found. Use list_projects first.` };
    const typeErr = this.validateTaskType(params.type);
    if (typeErr) return { success: false, error: typeErr };
    const taskNumber = project._count.tasks + 1;
    const slug = `${project.taskPrefix || 'TASK'}-${taskNumber}`;
    const task = await this.prisma.task.create({
      data: {
        title: params.title,
        description: params.description || null,
        type: params.type || 'TASK',
        priority: params.priority || 'MEDIUM',
        taskNumber,
        slug,
        startDate: this.safeDate(params.startDate),
        dueDate: this.safeDate(params.dueDate),
        storyPoints: params.storyPoints ? +params.storyPoints : null,
        customFields: params.customFields || null,
        projectId: params.projectId,
        statusId: params.statusId,
        sprintId: this.safeNullable(params.sprintId),
        parentTaskId: this.safeNullable(params.parentTaskId),
        createdBy: userId,
        updatedBy: userId,
        // Auto-assign creator when no explicit assignees provided
        assignees: params.assigneeIds?.length
          ? { create: params.assigneeIds.map((id: string) => ({ userId: id })) }
          : { create: [{ userId }] },
        reporters: params.reporterIds?.length
          ? { create: params.reporterIds.map((id: string) => ({ userId: id })) }
          : { create: [{ userId }] },
      },
      include: {
        project: { select: { name: true, slug: true } },
        status: { select: { name: true, color: true } },
      },
    });
    return {
      success: true,
      task,
      message: `Task "${task.title}" (${task.slug}) created in "${task.project.name}" with status "${task.status.name}"`,
    };
  }

  private async updateTask(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.taskId, 'taskId');
    if (err) return { success: false, error: err };
    // Validate optional UUID fields if provided
    for (const f of ['statusId', 'sprintId', 'parentTaskId']) {
      if (params[f] !== undefined) {
        const e = this.requireUUID(params[f], f);
        if (e) return { success: false, error: e };
      }
    }
    const typeErr = this.validateTaskType(params.type);
    if (typeErr) return { success: false, error: typeErr };
    const { taskId, ...data } = params;
    const updateData: any = { updatedBy: userId };
    const strFields = [
      'title',
      'description',
      'type',
      'priority',
      'statusId',
      'sprintId',
      'parentTaskId',
    ];
    const numFields = ['storyPoints', 'originalEstimate', 'remainingEstimate'];
    const dateFields = ['startDate', 'dueDate', 'completedAt'];
    for (const f of strFields) if (data[f] !== undefined) updateData[f] = data[f];
    for (const f of numFields) if (data[f] !== undefined) updateData[f] = +data[f];
    for (const f of dateFields) if (data[f] !== undefined) updateData[f] = this.safeDate(data[f]);
    if (data.assigneeIds !== undefined) {
      await this.prisma.taskAssignee.deleteMany({ where: { taskId } });
      if (data.assigneeIds.length > 0)
        await this.prisma.taskAssignee.createMany({
          data: data.assigneeIds.map((uid: string) => ({ taskId, userId: uid })),
        });
    }
    if (data.labelIds !== undefined) {
      await this.prisma.taskLabel.deleteMany({ where: { taskId } });
      if (data.labelIds.length > 0)
        await this.prisma.taskLabel.createMany({
          data: data.labelIds.map((lid: string) => ({ taskId, labelId: lid })),
        });
    }
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: { project: { select: { name: true } }, status: { select: { name: true } } },
    });
    return { success: true, task, message: `Task "${task.title}" updated` };
  }

  private async deleteTask(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.taskId, 'taskId');
    if (err) return { success: false, error: err };
    const t = await this.prisma.task.findUnique({
      where: { id: params.taskId },
      select: { title: true },
    });
    if (!t) return { success: false, error: 'Task not found. It may have been deleted already.' };
    await this.prisma.task.delete({ where: { id: params.taskId } });
    return { success: true, message: `Task "${t.title}" deleted successfully` };
  }

  private async updateTaskStatus(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.taskId, 'taskId') || this.requireUUID(params.statusId, 'statusId');
    if (err) return { success: false, error: err };
    const task = await this.prisma.task.update({
      where: { id: params.taskId },
      data: { statusId: params.statusId, updatedBy: userId },
      include: { status: { select: { name: true } }, project: { select: { name: true } } },
    });
    return { success: true, task, message: `Task "${task.title}" status → "${task.status.name}"` };
  }

  private async updateTaskPriority(params: Record<string, any>, userId: string) {
    const valid = ['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST'];
    const err =
      this.requireUUID(params.taskId, 'taskId') || this.requireString(params.priority, 'priority');
    if (err) return { success: false, error: err };
    const p = (params.priority as string).toUpperCase();
    if (!valid.includes(p))
      return {
        success: false,
        error: `Invalid priority "${params.priority}". Must be one of: ${valid.join(', ')}.`,
      };
    const task = await this.prisma.task.update({
      where: { id: params.taskId },
      data: { priority: p as any, updatedBy: userId },
      include: { project: { select: { name: true } } },
    });
    return { success: true, task, message: `Task "${task.title}" priority → ${p}` };
  }

  // ========== TASK COMMENT ==========

  private async listTaskComments(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.taskId, 'taskId');
    if (err) return { success: false, error: err };
    const page = Math.max(1, +(params.page || 1));
    const limit = Math.min(100, Math.max(1, +(params.limit || 20)));
    const [comments, total] = await Promise.all([
      this.prisma.taskComment.findMany({
        where: { taskId: params.taskId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, firstName: true, lastName: true, email: true } },
          parentCommentId: true,
          _count: { select: { replies: true } },
        },
      }),
      this.prisma.taskComment.count({ where: { taskId: params.taskId } }),
    ]);
    return {
      success: true,
      count: comments.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      comments,
    };
  }

  private async createTaskComment(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.taskId, 'taskId') || this.requireString(params.content, 'content');
    if (err) return { success: false, error: err };
    if (params.parentCommentId) {
      const pe = this.requireUUID(params.parentCommentId, 'parentCommentId');
      if (pe) return { success: false, error: pe };
    }
    const task = await this.prisma.task.findUnique({
      where: { id: params.taskId },
      select: { id: true, title: true },
    });
    if (!task)
      return { success: false, error: 'Task not found. Use list_tasks to find available tasks.' };
    const comment = await this.prisma.taskComment.create({
      data: {
        content: params.content,
        taskId: params.taskId,
        authorId: userId,
        parentCommentId: this.safeNullable(params.parentCommentId),
        createdBy: userId,
        updatedBy: userId,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return { success: true, comment, message: `Comment added to task "${task.title}"` };
  }

  // ========== TASK DEPENDENCY ==========

  private async listTaskDependencies(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.taskId, 'taskId');
    if (err) return { success: false, error: err };
    const [blocks, blockedBy] = await Promise.all([
      this.prisma.taskDependency.findMany({
        where: { blockingTaskId: params.taskId },
        select: {
          id: true,
          type: true,
          dependentTask: {
            select: {
              id: true,
              title: true,
              slug: true,
              status: { select: { id: true, name: true, color: true } },
            },
          },
        },
      }),
      this.prisma.taskDependency.findMany({
        where: { dependentTaskId: params.taskId },
        select: {
          id: true,
          type: true,
          blockingTask: {
            select: {
              id: true,
              title: true,
              slug: true,
              status: { select: { id: true, name: true, color: true } },
            },
          },
        },
      }),
    ]);
    return { success: true, blocks, blockedBy };
  }

  private async addTaskDependency(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.dependentTaskId, 'dependentTaskId') ||
      this.requireUUID(params.blockingTaskId, 'blockingTaskId');
    if (err) return { success: false, error: err };
    if (params.dependentTaskId === params.blockingTaskId) {
      return { success: false, error: 'A task cannot depend on itself.' };
    }
    const dep = await this.prisma.taskDependency.create({
      data: {
        dependentTaskId: params.dependentTaskId,
        blockingTaskId: params.blockingTaskId,
        type: params.type || 'BLOCKS',
        createdBy: userId,
        updatedBy: userId,
      },
      include: {
        dependentTask: { select: { id: true, title: true, slug: true } },
        blockingTask: { select: { id: true, title: true, slug: true } },
      },
    });
    return {
      success: true,
      dependency: dep,
      message: `"${dep.blockingTask.title}" now blocks "${dep.dependentTask.title}"`,
    };
  }

  private async removeTaskDependency(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.dependentTaskId, 'dependentTaskId') ||
      this.requireUUID(params.blockingTaskId, 'blockingTaskId');
    if (err) return { success: false, error: err };
    const dep = await this.prisma.taskDependency.findUnique({
      where: {
        dependentTaskId_blockingTaskId: {
          dependentTaskId: params.dependentTaskId,
          blockingTaskId: params.blockingTaskId,
        },
      },
    });
    if (!dep)
      return { success: false, error: 'Dependency not found. It may have been removed already.' };
    await this.prisma.taskDependency.delete({ where: { id: dep.id } });
    return { success: true, message: 'Dependency removed' };
  }

  // ========== SPRINT ==========

  private async listSprints(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.projectId, 'projectId');
    if (err) return { success: false, error: err };
    const sprints = await this.prisma.sprint.findMany({
      where: { projectId: params.projectId, archive: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        goal: true,
        status: true,
        isDefault: true,
        startDate: true,
        endDate: true,
        _count: { select: { tasks: true } },
      },
    });
    return { success: true, count: sprints.length, sprints };
  }

  private async createSprint(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.projectId, 'projectId') || this.requireString(params.name, 'name');
    if (err) return { success: false, error: err };
    const project = await this.prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true },
    });
    if (!project) return { success: false, error: `Project not found. Use list_projects first.` };
    const slug = slugify(params.name, { lower: true, strict: true });
    const sprint = await this.prisma.sprint.create({
      data: {
        name: params.name,
        slug,
        goal: params.goal || null,
        startDate: this.safeDate(params.startDate),
        endDate: this.safeDate(params.endDate),
        projectId: params.projectId,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return { success: true, sprint, message: `Sprint "${sprint.name}" created` };
  }

  private async updateSprint(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.sprintId, 'sprintId');
    if (err) return { success: false, error: err };
    const { sprintId, ...data } = params;
    const updateData: any = { updatedBy: userId };
    const strFields = ['name', 'goal', 'status'];
    const dateFields = ['startDate', 'endDate'];
    for (const f of strFields) if (data[f] !== undefined) updateData[f] = data[f];
    for (const f of dateFields) if (data[f] !== undefined) updateData[f] = this.safeDate(data[f]);
    const sprint = await this.prisma.sprint.update({ where: { id: sprintId }, data: updateData });
    return { success: true, sprint, message: `Sprint "${sprint.name}" updated` };
  }

  private async deleteSprint(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.sprintId, 'sprintId');
    if (err) return { success: false, error: err };
    const s = await this.prisma.sprint.findUnique({
      where: { id: params.sprintId },
      select: { name: true },
    });
    if (!s) return { success: false, error: 'Sprint not found. It may have been deleted already.' };
    await this.prisma.sprint.delete({ where: { id: params.sprintId } });
    return { success: true, message: `Sprint "${s.name}" deleted` };
  }

  // ========== LABEL ==========

  private async listLabels(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.projectId, 'projectId');
    if (err) return { success: false, error: err };
    const labels = await this.prisma.label.findMany({
      where: { projectId: params.projectId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true, description: true },
    });
    return { success: true, count: labels.length, labels };
  }

  private async createLabel(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.projectId, 'projectId') ||
      this.requireString(params.name, 'name') ||
      this.requireString(params.color, 'color');
    if (err) return { success: false, error: err };
    const project = await this.prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true },
    });
    if (!project) return { success: false, error: `Project not found. Use list_projects first.` };
    const label = await this.prisma.label.create({
      data: {
        name: params.name,
        color: params.color,
        description: params.description || null,
        projectId: params.projectId,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return { success: true, label, message: `Label "${label.name}" created` };
  }

  private async updateLabel(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.labelId, 'labelId');
    if (err) return { success: false, error: err };
    const { labelId, ...data } = params;
    const updateData: any = { updatedBy: userId };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.description !== undefined) updateData.description = data.description;
    const label = await this.prisma.label.update({ where: { id: labelId }, data: updateData });
    return { success: true, label, message: `Label "${label.name}" updated` };
  }

  private async deleteLabel(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.labelId, 'labelId');
    if (err) return { success: false, error: err };
    const l = await this.prisma.label.findUnique({
      where: { id: params.labelId },
      select: { name: true },
    });
    if (!l) return { success: false, error: 'Label not found. It may have been deleted already.' };
    await this.prisma.label.delete({ where: { id: params.labelId } });
    return { success: true, message: `Label "${l.name}" deleted` };
  }

  // ========== TASK STATUS ==========

  private async listTaskStatuses(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.workflowId, 'workflowId');
    if (err)
      return {
        success: false,
        error: `${err} To find the workflowId, first use get_project to get the project details which include workflow.id.`,
      };
    const statuses = await this.prisma.taskStatus.findMany({
      where: { workflowId: params.workflowId, deletedAt: null },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
        category: true,
        position: true,
        isDefault: true,
      },
    });
    return { success: true, count: statuses.length, statuses };
  }

  // ========== PROJECT MEMBER ==========

  private async listProjectMembers(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.projectId, 'projectId');
    if (err) return { success: false, error: err };
    const members = await this.prisma.projectMember.findMany({
      where: { projectId: params.projectId },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
      },
    });
    return { success: true, count: members.length, members };
  }

  // ========== WORKSPACE MEMBER ==========

  private async listWorkspaceMembers(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.workspaceId, 'workspaceId');
    if (err) return { success: false, error: err };
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: params.workspaceId },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
      },
    });
    return { success: true, count: members.length, members };
  }

  private async addWorkspaceMember(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.workspaceId, 'workspaceId') ||
      this.requireUUID(params.userId, 'userId');
    if (err) return { success: false, error: err };
    const ws = await this.prisma.workspace.findUnique({
      where: { id: params.workspaceId },
      select: { name: true },
    });
    if (!ws) return { success: false, error: 'Workspace not found.' };
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true },
    });
    if (!user) return { success: false, error: 'User not found.' };
    const member = await this.prisma.workspaceMember.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        role: params.role || 'MEMBER',
        createdBy: userId,
        updatedBy: userId,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return {
      success: true,
      member,
      message: `${member.user.firstName} added to workspace "${ws.name}"`,
    };
  }

  private async removeWorkspaceMember(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.workspaceId, 'workspaceId') ||
      this.requireUUID(params.userId, 'userId');
    if (err) return { success: false, error: err };
    const member = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: params.userId, workspaceId: params.workspaceId } },
      select: { id: true, user: { select: { firstName: true } } },
    });
    if (!member) return { success: false, error: 'Workspace member not found.' };
    await this.prisma.workspaceMember.delete({ where: { id: member.id } });
    return { success: true, message: `${member.user.firstName} removed from workspace` };
  }

  // ========== PROJECT MEMBER ==========

  private async addProjectMember(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.projectId, 'projectId') || this.requireUUID(params.userId, 'userId');
    if (err) return { success: false, error: err };
    const project = await this.prisma.project.findUnique({
      where: { id: params.projectId },
      select: { name: true },
    });
    if (!project) return { success: false, error: 'Project not found.' };
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true },
    });
    if (!user) return { success: false, error: 'User not found.' };
    const member = await this.prisma.projectMember.create({
      data: {
        projectId: params.projectId,
        userId: params.userId,
        role: params.role || 'MEMBER',
        createdBy: userId,
        updatedBy: userId,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return {
      success: true,
      member,
      message: `${member.user.firstName} added to project "${project.name}"`,
    };
  }

  private async removeProjectMember(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.projectId, 'projectId') || this.requireUUID(params.userId, 'userId');
    if (err) return { success: false, error: err };
    const member = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: params.userId, projectId: params.projectId } },
      select: { id: true, user: { select: { firstName: true } } },
    });
    if (!member) return { success: false, error: 'Project member not found.' };
    await this.prisma.projectMember.delete({ where: { id: member.id } });
    return { success: true, message: `${member.user.firstName} removed from project` };
  }

  private async updateProjectMemberRole(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.projectId, 'projectId') ||
      this.requireUUID(params.userId, 'userId') ||
      this.requireString(params.role, 'role');
    if (err) return { success: false, error: err };
    const validRoles = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'];
    if (!validRoles.includes(params.role))
      return {
        success: false,
        error: `Invalid role "${params.role}". Must be one of: ${validRoles.join(', ')}.`,
      };
    const member = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: params.userId, projectId: params.projectId } },
      select: { id: true },
    });
    if (!member) return { success: false, error: 'Project member not found.' };
    const updated = await this.prisma.projectMember.update({
      where: { id: member.id },
      data: { role: params.role, updatedBy: userId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return {
      success: true,
      member: updated,
      message: `${updated.user.firstName}'s role → ${params.role}`,
    };
  }

  // ========== INVITATION ==========

  private async listInvitations(params: Record<string, any>, userId: string) {
    const where: any = {};
    if (params.organizationId) where.organizationId = params.organizationId;
    if (params.workspaceId) where.workspaceId = params.workspaceId;
    if (params.projectId) where.projectId = params.projectId;
    if (params.status) where.status = params.status;
    else where.status = 'PENDING'; // default to pending
    const invitations = await this.prisma.invitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        inviteeEmail: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        organization: { select: { id: true, name: true } },
        workspace: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });
    return { success: true, count: invitations.length, invitations };
  }

  private async createInvitation(params: Record<string, any>, userId: string) {
    const err =
      this.requireString(params.inviteeEmail, 'inviteeEmail') ||
      this.requireString(params.role, 'role');
    if (err) return { success: false, error: err };
    if (!params.organizationId && !params.workspaceId && !params.projectId) {
      return {
        success: false,
        error: 'At least one of organizationId, workspaceId, or projectId is required.',
      };
    }
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const invitation = await this.prisma.invitation.create({
      data: {
        inviterId: userId,
        inviteeEmail: params.inviteeEmail,
        role: params.role,
        token,
        expiresAt,
        organizationId: this.safeNullable(params.organizationId),
        workspaceId: this.safeNullable(params.workspaceId),
        projectId: this.safeNullable(params.projectId),
      },
    });
    return {
      success: true,
      invitation: {
        id: invitation.id,
        inviteeEmail: invitation.inviteeEmail,
        role: invitation.role,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
      },
      message: `Invitation sent to ${params.inviteeEmail}`,
    };
  }

  // ========== NOTIFICATION ==========

  private async listNotifications(params: Record<string, any>, userId: string) {
    const where: any = { userId };
    if (params.isRead !== undefined) where.isRead = params.isRead;
    const page = Math.max(1, +(params.page || 1));
    const limit = Math.min(100, Math.max(1, +(params.limit || 20)));
    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          priority: true,
          isRead: true,
          entityType: true,
          entityId: true,
          actionUrl: true,
          createdAt: true,
          readAt: true,
        },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return {
      success: true,
      count: notifications.length,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      notifications,
    };
  }

  private async markNotificationRead(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.notificationId, 'notificationId');
    if (err) return { success: false, error: err };
    const notification = await this.prisma.notification.findFirst({
      where: { id: params.notificationId, userId },
      select: { id: true },
    });
    if (!notification) return { success: false, error: 'Notification not found.' };
    await this.prisma.notification.update({
      where: { id: params.notificationId },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true, message: 'Notification marked as read' };
  }

  // ========== WORKFLOW ==========

  private async listWorkflows(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.organizationId, 'organizationId');
    if (err) return { success: false, error: err };
    const workflows = await this.prisma.workflow.findMany({
      where: { organizationId: params.organizationId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        isDefault: true,
        _count: { select: { statuses: true, transitions: true, Project: true } },
      },
    });
    return { success: true, count: workflows.length, workflows };
  }

  private async getWorkflow(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.workflowId, 'workflowId');
    if (err) return { success: false, error: err };
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: params.workflowId },
      select: {
        id: true,
        name: true,
        description: true,
        isDefault: true,
        organizationId: true,
        statuses: {
          where: { deletedAt: null },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            color: true,
            category: true,
            position: true,
            isDefault: true,
          },
        },
      },
    });
    if (!workflow)
      return { success: false, error: 'Workflow not found. Use list_workflows first.' };
    return { success: true, workflow };
  }

  private async listStatusTransitions(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.workflowId, 'workflowId');
    if (err) return { success: false, error: err };
    const transitions = await this.prisma.statusTransition.findMany({
      where: { workflowId: params.workflowId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        fromStatus: { select: { id: true, name: true, color: true } },
        toStatus: { select: { id: true, name: true, color: true } },
      },
    });
    return { success: true, count: transitions.length, transitions };
  }

  // ========== CUSTOM FIELD ==========

  private async listCustomFields(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.organizationId, 'organizationId');
    if (err) return { success: false, error: err };
    const fields = await this.prisma.customField.findMany({
      where: { organizationId: params.organizationId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        isRequired: true,
        options: true,
      },
    });
    return { success: true, count: fields.length, fields };
  }

  private async getCustomField(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.customFieldId, 'customFieldId');
    if (err) return { success: false, error: err };
    const field = await this.prisma.customField.findUnique({
      where: { id: params.customFieldId },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        isRequired: true,
        options: true,
        organizationId: true,
      },
    });
    if (!field) return { success: false, error: 'Custom field not found.' };
    return { success: true, field };
  }

  // ========== RECURRING TASK ==========

  private async getTaskRecurrence(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.taskId, 'taskId');
    if (err) return { success: false, error: err };
    const recurrence = await this.prisma.recurringTask.findUnique({
      where: { taskId: params.taskId },
      select: {
        id: true,
        recurrenceType: true,
        interval: true,
        daysOfWeek: true,
        dayOfMonth: true,
        monthOfYear: true,
        endType: true,
        endDate: true,
        occurrenceCount: true,
        currentOccurrence: true,
        isActive: true,
        nextOccurrence: true,
      },
    });
    if (!recurrence)
      return { success: false, error: 'This task does not have a recurrence configuration.' };
    return { success: true, recurrence };
  }

  private async disableTaskRecurrence(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.taskId, 'taskId');
    if (err) return { success: false, error: err };
    const recurrence = await this.prisma.recurringTask.findUnique({
      where: { taskId: params.taskId },
      select: { id: true },
    });
    if (!recurrence)
      return { success: false, error: 'This task does not have a recurrence configuration.' };
    await this.prisma.recurringTask.update({
      where: { taskId: params.taskId },
      data: { isActive: false },
    });
    await this.prisma.task.update({ where: { id: params.taskId }, data: { isRecurring: false } });
    return { success: true, message: 'Task recurrence disabled' };
  }

  // ========== PUBLIC TASK SHARE ==========

  private async listTaskShares(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.taskId, 'taskId');
    if (err) return { success: false, error: err };
    const shares = await this.prisma.publicTaskShare.findMany({
      where: { taskId: params.taskId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, token: true, expiresAt: true, createdAt: true },
    });
    return { success: true, count: shares.length, shares };
  }

  private async shareTaskPublicly(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.taskId, 'taskId');
    if (err) return { success: false, error: err };
    const task = await this.prisma.task.findUnique({
      where: { id: params.taskId },
      select: { id: true },
    });
    if (!task) return { success: false, error: 'Task not found.' };
    const token = crypto.randomUUID();
    const expiresAt =
      this.safeDate(params.expiresAt) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const share = await this.prisma.publicTaskShare.create({
      data: { taskId: params.taskId, token, expiresAt, createdBy: userId },
    });
    return {
      success: true,
      share: { id: share.id, token: share.token, expiresAt: share.expiresAt },
      message: `Public share link created for task`,
    };
  }

  private async revokeTaskShare(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.shareId, 'shareId');
    if (err) return { success: false, error: err };
    const share = await this.prisma.publicTaskShare.findUnique({
      where: { id: params.shareId },
      select: { id: true, revokedAt: true },
    });
    if (!share) return { success: false, error: 'Share not found.' };
    if (share.revokedAt) return { success: false, error: 'Share is already revoked.' };
    await this.prisma.publicTaskShare.update({
      where: { id: params.shareId },
      data: { revokedAt: new Date() },
    });
    return { success: true, message: 'Public share revoked' };
  }

  // ========== TASK ATTACHMENT ==========

  private async listTaskAttachments(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.taskId, 'taskId');
    if (err) return { success: false, error: err };
    const attachments = await this.prisma.taskAttachment.findMany({
      where: { taskId: params.taskId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        url: true,
        createdAt: true,
      },
    });
    return { success: true, count: attachments.length, attachments };
  }

  // ========== AUTOMATION RULE ==========

  private async listAutomationRules(params: Record<string, any>, userId: string) {
    const where: any = {};
    if (params.projectId) where.projectId = params.projectId;
    if (params.workspaceId) where.workspaceId = params.workspaceId;
    if (params.organizationId) where.organizationId = params.organizationId;
    const rules = await this.prisma.automationRule.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 50,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        triggerType: true,
        actionType: true,
        executionCount: true,
        lastExecuted: true,
        project: { select: { id: true, name: true } },
        workspace: { select: { id: true, name: true } },
      },
    });
    return { success: true, count: rules.length, rules };
  }

  // ========== TIME ENTRY ==========

  private async listTimeEntries(params: Record<string, any>, userId: string) {
    const where: any = {};
    if (params.taskId) {
      const err = this.requireUUID(params.taskId, 'taskId');
      if (err) return { success: false, error: err };
      where.taskId = params.taskId;
    }
    if (params.projectId) {
      const err = this.requireUUID(params.projectId, 'projectId');
      if (err) return { success: false, error: err };
      const taskIds = await this.prisma.task.findMany({
        where: { projectId: params.projectId, isArchived: false },
        select: { id: true },
      });
      where.taskId = { in: taskIds.map((t) => t.id) };
    }
    const page = Math.max(1, +(params.page || 1));
    const limit = Math.min(100, Math.max(1, +(params.limit || 20)));
    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          description: true,
          timeSpent: true,
          startTime: true,
          endTime: true,
          date: true,
          createdAt: true,
          task: { select: { id: true, title: true, slug: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);
    return {
      success: true,
      count: entries.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      entries,
    };
  }

  private async createTimeEntry(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.taskId, 'taskId');
    if (err) return { success: false, error: err };
    if (params.timeSpent === undefined || +params.timeSpent <= 0) {
      return { success: false, error: 'timeSpent must be a positive number (in minutes).' };
    }
    const task = await this.prisma.task.findUnique({
      where: { id: params.taskId },
      select: { id: true, title: true },
    });
    if (!task)
      return { success: false, error: 'Task not found. Use list_tasks to find available tasks.' };
    const entry = await this.prisma.timeEntry.create({
      data: {
        description: params.description || null,
        timeSpent: Math.round(+params.timeSpent),
        startTime: this.safeDate(params.startTime),
        endTime: this.safeDate(params.endTime),
        date: this.safeDate(params.date) || new Date(),
        taskId: params.taskId,
        userId,
        createdBy: userId,
        updatedBy: userId,
      },
      include: {
        task: { select: { id: true, title: true, slug: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return {
      success: true,
      entry,
      message: `Time entry of ${entry.timeSpent} min logged for task "${task.title}"`,
    };
  }

  private async deleteTimeEntry(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.timeEntryId, 'timeEntryId');
    if (err) return { success: false, error: err };
    const e = await this.prisma.timeEntry.findUnique({
      where: { id: params.timeEntryId },
      select: { id: true },
    });
    if (!e)
      return { success: false, error: 'Time entry not found. It may have been deleted already.' };
    await this.prisma.timeEntry.delete({ where: { id: params.timeEntryId } });
    return { success: true, message: 'Time entry deleted' };
  }

  // ========== ORGANIZATION ==========

  private async getOrganization(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.organizationId, 'organizationId');
    if (err) return { success: false, error: err };
    const org = await this.prisma.organization.findUnique({
      where: { id: params.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        avatar: true,
        website: true,
        createdAt: true,
        _count: { select: { members: true, workspaces: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!org) return { success: false, error: 'Organization not found.' };
    return { success: true, organization: org };
  }

  private async updateOrganization(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.organizationId, 'organizationId');
    if (err) return { success: false, error: err };
    const { organizationId, ...data } = params;
    const updateData: any = { updatedBy: userId };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.website !== undefined) updateData.website = data.website;
    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: updateData,
    });
    return {
      success: true,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        description: org.description,
        website: org.website,
      },
      message: `Organization "${org.name}" updated`,
    };
  }

  private async listOrganizationMembers(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.organizationId, 'organizationId');
    if (err) return { success: false, error: err };
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: params.organizationId },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        organization: { select: { id: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
      },
    });
    return { success: true, count: members.length, members };
  }

  // ========== WORKSPACE MEMBER EXTENDED ==========

  private async updateWorkspaceMemberRole(params: Record<string, any>, userId: string) {
    const err =
      this.requireUUID(params.workspaceId, 'workspaceId') ||
      this.requireUUID(params.userId, 'userId') ||
      this.requireString(params.role, 'role');
    if (err) return { success: false, error: err };
    const valid = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'];
    if (!valid.includes(params.role))
      return {
        success: false,
        error: `Invalid role "${params.role}". Must be one of: ${valid.join(', ')}.`,
      };
    const member = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: params.userId, workspaceId: params.workspaceId } },
      select: { id: true },
    });
    if (!member) return { success: false, error: 'Workspace member not found.' };
    const updated = await this.prisma.workspaceMember.update({
      where: { id: member.id },
      data: { role: params.role, updatedBy: userId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return {
      success: true,
      member: updated,
      message: `${updated.user.firstName}'s workspace role → ${params.role}`,
    };
  }

  // ========== SETTINGS ==========

  private async listSettings(params: Record<string, any>, userId: string) {
    const where: any = { userId: null }; // global settings only for safety
    if (params.category) where.category = params.category;
    const settings = await this.prisma.settings.findMany({
      where,
      orderBy: { category: 'asc' },
      select: {
        id: true,
        key: true,
        value: true,
        description: true,
        category: true,
        isEncrypted: true,
      },
    });
    return { success: true, count: settings.length, settings };
  }

  private async getSetting(params: Record<string, any>, userId: string) {
    const err = this.requireString(params.key, 'key');
    if (err) return { success: false, error: err };
    const setting = await this.prisma.settings.findFirst({
      where: { key: params.key, userId: null },
      select: {
        id: true,
        key: true,
        value: true,
        description: true,
        category: true,
        isEncrypted: true,
      },
    });
    if (!setting) return { success: false, error: `Setting "${params.key}" not found.` };
    return { success: true, setting };
  }

  private async updateSetting(params: Record<string, any>, userId: string) {
    const err = this.requireString(params.key, 'key');
    if (err) return { success: false, error: err };
    const setting = await this.prisma.settings.findFirst({
      where: { key: params.key, userId: null },
      select: { id: true, isEncrypted: true, key: true },
    });
    if (!setting) return { success: false, error: `Setting "${params.key}" not found.` };
    if (setting.isEncrypted)
      return {
        success: false,
        error: `Setting "${params.key}" is encrypted and cannot be updated via MCP for security reasons.`,
      };
    await this.prisma.settings.update({ where: { id: setting.id }, data: { value: params.value } });
    return { success: true, message: `Setting "${params.key}" updated` };
  }

  // ========== USER ==========

  private async listUsers(params: Record<string, any>, userId: string) {
    const where: any = {};
    if (params.organizationId || params.workspaceId) {
      const memberFilter: any = {};
      if (params.organizationId) {
        const err = this.requireUUID(params.organizationId, 'organizationId');
        if (err) return { success: false, error: err };
        memberFilter.organizationId = params.organizationId;
      }
      if (params.workspaceId) {
        const err = this.requireUUID(params.workspaceId, 'workspaceId');
        if (err) return { success: false, error: err };
        memberFilter.workspaceId = params.workspaceId;
      }
      if (memberFilter.organizationId) {
        const members = await this.prisma.organizationMember.findMany({
          where: memberFilter,
          select: { userId: true },
        });
        where.id = { in: members.map((m) => m.userId) };
      } else if (memberFilter.workspaceId) {
        const members = await this.prisma.workspaceMember.findMany({
          where: memberFilter,
          select: { userId: true },
        });
        where.id = { in: members.map((m) => m.userId) };
      }
    }
    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: 'insensitive' as const } },
        { lastName: { contains: params.search, mode: 'insensitive' as const } },
        { email: { contains: params.search, mode: 'insensitive' as const } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { firstName: 'asc' },
      take: 50,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        username: true,
        avatar: true,
        role: true,
        status: true,
        timezone: true,
        lastLoginAt: true,
      },
    });
    return { success: true, count: users.length, users };
  }

  private async getUser(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.userId, 'userId');
    if (err) return { success: false, error: err };
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        username: true,
        avatar: true,
        bio: true,
        role: true,
        status: true,
        timezone: true,
        language: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!user) return { success: false, error: 'User not found.' };
    return { success: true, user };
  }

  // ========== INBOX ==========

  private async getProjectInbox(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.projectId, 'projectId');
    if (err) return { success: false, error: err };
    const inbox = await this.prisma.projectInbox.findUnique({
      where: { projectId: params.projectId },
      select: {
        id: true,
        projectId: true,
        enabled: true,
        name: true,
        description: true,
        emailAddress: true,
        autoCreateTask: true,
        defaultTaskType: true,
        defaultPriority: true,
        syncInterval: true,
        _count: { select: { messages: true, rules: true } },
      },
    });
    if (!inbox) return { success: false, error: 'No inbox configured for this project.' };
    return { success: true, inbox };
  }

  private async listInboxRules(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.projectInboxId, 'projectInboxId');
    if (err) return { success: false, error: err };
    const rules = await this.prisma.inboxRule.findMany({
      where: { projectInboxId: params.projectInboxId },
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        priority: true,
        enabled: true,
        stopOnMatch: true,
        conditions: true,
        actions: true,
      },
    });
    return { success: true, count: rules.length, rules };
  }

  private async listInboxMessages(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.projectInboxId, 'projectInboxId');
    if (err) return { success: false, error: err };
    const where: any = { projectInboxId: params.projectInboxId };
    if (params.status) where.status = params.status;
    const page = Math.max(1, +(params.page || 1));
    const limit = Math.min(50, Math.max(1, +(params.limit || 20)));
    const [messages, total] = await Promise.all([
      this.prisma.inboxMessage.findMany({
        where,
        orderBy: { emailDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          subject: true,
          fromEmail: true,
          fromName: true,
          status: true,
          emailDate: true,
          hasAttachments: true,
          snippet: true,
          converted: true,
        },
      }),
      this.prisma.inboxMessage.count({ where }),
    ]);
    return {
      success: true,
      count: messages.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      messages,
    };
  }

  // ========== AUTOMATION RULE EXTENDED ==========

  private async createAutomationRule(params: Record<string, any>, userId: string) {
    const err =
      this.requireString(params.name, 'name') ||
      this.requireString(params.triggerType, 'triggerType') ||
      this.requireString(params.actionType, 'actionType');
    if (err) return { success: false, error: err };
    const rule = await this.prisma.automationRule.create({
      data: {
        name: params.name,
        description: params.description || null,
        triggerType: params.triggerType,
        actionType: params.actionType,
        triggerConfig: params.triggerConfig || null,
        actionConfig: params.actionConfig || null,
        organizationId: this.safeNullable(params.organizationId),
        workspaceId: this.safeNullable(params.workspaceId),
        projectId: this.safeNullable(params.projectId),
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return {
      success: true,
      rule: {
        id: rule.id,
        name: rule.name,
        triggerType: rule.triggerType,
        actionType: rule.actionType,
        status: rule.status,
      },
      message: `Automation rule "${rule.name}" created`,
    };
  }

  private async toggleAutomationRule(params: Record<string, any>, userId: string) {
    const err = this.requireUUID(params.ruleId, 'ruleId');
    if (err) return { success: false, error: err };
    const rule = await this.prisma.automationRule.findUnique({
      where: { id: params.ruleId },
      select: { id: true, name: true, status: true },
    });
    if (!rule) return { success: false, error: 'Automation rule not found.' };
    const newStatus = params.enabled ? 'ACTIVE' : 'INACTIVE';
    const updated = await this.prisma.automationRule.update({
      where: { id: params.ruleId },
      data: { status: newStatus, updatedBy: userId },
    });
    return {
      success: true,
      rule: { id: updated.id, name: updated.name, status: updated.status },
      message: `Rule "${rule.name}" → ${newStatus}`,
    };
  }

  // ========== ACTIVITY LOG ==========

  private async listActivityLogs(params: Record<string, any>, userId: string) {
    const where: any = {};
    if (params.organizationId) where.organizationId = params.organizationId;
    if (params.entityType) where.entityType = params.entityType;
    if (params.projectId) {
      const taskIds = await this.prisma.task.findMany({
        where: { projectId: params.projectId },
        select: { id: true },
      });
      where.OR = [
        { entityType: 'Project', entityId: params.projectId },
        { entityType: 'Task', entityId: { in: taskIds.map((t) => t.id) } },
      ];
    }
    const page = Math.max(1, +(params.page || 1));
    const limit = Math.min(100, Math.max(1, +(params.limit || 20)));
    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          description: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);
    return {
      success: true,
      count: logs.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      logs,
    };
  }

  private async listOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            _count: { select: { workspaces: true, members: true } },
          },
        },
      },
    });
    const organizations = memberships.map((m) => ({ ...m.organization, myRole: m.role }));
    return { success: true, count: organizations.length, organizations };
  }
}

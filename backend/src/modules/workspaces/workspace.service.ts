import crypto from 'crypto';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  JoinWorkspaceInput,
  InviteMemberInput,
  UpdateWorkspaceRoleInput,
} from './workspace.schema.js';

const WORKSPACE_SELECT = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  description: true,
  inviteCode: true,
  settingsJson: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      members: true,
      channels: true,
    },
  },
} as const;

export async function getUserWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        select: WORKSPACE_SELECT,
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return memberships.map((m) => ({
    ...m.workspace,
    myRole: m.role,
    joinedAt: m.joinedAt,
  }));
}

export async function createWorkspace(userId: string, input: CreateWorkspaceInput) {
  const slug =
    input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name: input.name.trim(),
        slug,
        logoUrl: input.logoUrl,
        description: input.description,
        settingsJson: input.settingsJson || JSON.stringify({ allowMemberInvites: true }),
        createdById: userId,
      },
      select: WORKSPACE_SELECT,
    });

    await tx.workspaceMember.create({
      data: {
        userId,
        workspaceId: ws.id,
        role: 'OWNER',
      },
    });

    // Create default #general and #random channels for the new workspace
    const generalChannel = await tx.channel.create({
      data: {
        name: 'general',
        slug: `general-${ws.id.slice(0, 8)}`,
        description: 'Company-wide announcements and general conversation',
        type: 'PUBLIC',
        createdById: userId,
        workspaceId: ws.id,
      },
    });

    const randomChannel = await tx.channel.create({
      data: {
        name: 'random',
        slug: `random-${ws.id.slice(0, 8)}`,
        description: 'Non-work banter and water cooler conversation',
        type: 'PUBLIC',
        createdById: userId,
        workspaceId: ws.id,
      },
    });

    await tx.channelMember.createMany({
      data: [
        { userId, channelId: generalChannel.id, role: 'ADMIN' },
        { userId, channelId: randomChannel.id, role: 'ADMIN' },
      ],
    });

    return ws;
  });

  return { ...workspace, myRole: 'OWNER' };
}

export async function getWorkspaceByIdOrSlug(userId: string, idOrSlug: string) {
  const workspace = await prisma.workspace.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    select: WORKSPACE_SELECT,
  });

  if (!workspace) {
    throw ApiError.notFound('Workspace not found');
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId: workspace.id },
    },
  });

  if (!membership) {
    throw ApiError.forbidden('You are not a member of this workspace');
  }

  return { ...workspace, myRole: membership.role };
}

export async function updateWorkspace(userId: string, workspaceId: string, input: UpdateWorkspaceInput) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });

  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw ApiError.forbidden('Only workspace Owners and Admins can update settings');
  }

  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      ...(input.name && { name: input.name.trim() }),
      ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.settingsJson !== undefined && { settingsJson: input.settingsJson }),
    },
    select: WORKSPACE_SELECT,
  });

  return { ...updated, myRole: membership.role };
}

export async function deleteWorkspace(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });

  if (!membership || membership.role !== 'OWNER') {
    throw ApiError.forbidden('Only the Workspace Owner can delete the workspace');
  }

  await prisma.workspace.delete({
    where: { id: workspaceId },
  });
}

export async function leaveWorkspace(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });

  if (!membership) {
    throw ApiError.notFound('Membership record not found');
  }

  if (membership.role === 'OWNER') {
    const ownerCount = await prisma.workspaceMember.count({
      where: { workspaceId, role: 'OWNER' },
    });
    if (ownerCount <= 1) {
      throw ApiError.badRequest('Workspace Owner cannot leave without transferring ownership first');
    }
  }

  await prisma.workspaceMember.delete({
    where: { id: membership.id },
  });
}

export async function joinWorkspaceByInviteCode(userId: string, input: JoinWorkspaceInput) {
  const workspace = await prisma.workspace.findUnique({
    where: { inviteCode: input.inviteCode.trim() },
    select: WORKSPACE_SELECT,
  });

  if (!workspace) {
    throw ApiError.notFound('Invalid workspace invite code');
  }

  const existing = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId: workspace.id },
    },
  });

  if (existing) {
    return { ...workspace, myRole: existing.role, alreadyMember: true };
  }

  const membership = await prisma.workspaceMember.create({
    data: {
      userId,
      workspaceId: workspace.id,
      role: 'MEMBER',
    },
  });

  // Auto-join public channels of this workspace
  const publicChannels = await prisma.channel.findMany({
    where: { workspaceId: workspace.id, type: 'PUBLIC' },
  });

  for (const ch of publicChannels) {
    await prisma.channelMember.upsert({
      where: { userId_channelId: { userId, channelId: ch.id } },
      update: {},
      create: { userId, channelId: ch.id, role: 'MEMBER' },
    });
  }

  return { ...workspace, myRole: membership.role, alreadyMember: false };
}

export async function getWorkspaceMembers(userId: string, workspaceId: string, search?: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });

  if (!membership) {
    throw ApiError.forbidden('You are not a member of this workspace');
  }

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      ...(search
        ? {
            user: {
              OR: [
                { displayName: { contains: search } },
                { username: { contains: search } },
                { email: { contains: search } },
              ],
            },
          }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          statusText: true,
          isOnline: true,
          lastSeenAt: true,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { user: { displayName: 'asc' } }],
  });

  return members.map((m) => ({
    memberId: m.id,
    ...m.user,
    role: m.role,
    joinedAt: m.joinedAt,
  }));
}

export async function updateMemberRole(
  actorUserId: string,
  workspaceId: string,
  targetUserId: string,
  input: UpdateWorkspaceRoleInput
) {
  const actorMembership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: actorUserId, workspaceId } },
  });

  if (!actorMembership || !['OWNER', 'ADMIN'].includes(actorMembership.role)) {
    throw ApiError.forbidden('Only Workspace Owners and Admins can update member roles');
  }

  const targetMembership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
  });

  if (!targetMembership) {
    throw ApiError.notFound('Target member not found in this workspace');
  }

  // Admin cannot modify Owner or assign Owner
  if (actorMembership.role === 'ADMIN') {
    if (targetMembership.role === 'OWNER' || input.role === 'OWNER') {
      throw ApiError.forbidden('Only Workspace Owners can assign or revoke Owner status');
    }
  }

  // Transfer ownership if newRole === 'OWNER'
  if (input.role === 'OWNER') {
    await prisma.$transaction([
      prisma.workspaceMember.update({
        where: { id: targetMembership.id },
        data: { role: 'OWNER' },
      }),
      prisma.workspaceMember.update({
        where: { id: actorMembership.id },
        data: { role: 'ADMIN' },
      }),
    ]);
  } else {
    await prisma.workspaceMember.update({
      where: { id: targetMembership.id },
      data: { role: input.role },
    });
  }

  return getWorkspaceMembers(actorUserId, workspaceId);
}

export async function removeMember(actorUserId: string, workspaceId: string, targetUserId: string) {
  const actorMembership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: actorUserId, workspaceId } },
  });

  if (!actorMembership || !['OWNER', 'ADMIN'].includes(actorMembership.role)) {
    throw ApiError.forbidden('Only Workspace Owners and Admins can remove members');
  }

  const targetMembership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
  });

  if (!targetMembership) {
    throw ApiError.notFound('Target member not found in this workspace');
  }

  if (targetMembership.role === 'OWNER') {
    throw ApiError.forbidden('Workspace Owner cannot be removed from workspace');
  }

  if (actorMembership.role === 'ADMIN' && targetMembership.role === 'ADMIN') {
    throw ApiError.forbidden('Admins cannot remove other Admins');
  }

  await prisma.workspaceMember.delete({
    where: { id: targetMembership.id },
  });
}

// ─── Workspace Invitations ─────────────────────────────

export async function createInvitation(actorUserId: string, workspaceId: string, input: InviteMemberInput) {
  const actorMembership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: actorUserId, workspaceId } },
  });

  if (!actorMembership || !['OWNER', 'ADMIN'].includes(actorMembership.role)) {
    throw ApiError.forbidden('Only Workspace Owners and Admins can invite members');
  }

  const email = input.email.toLowerCase().trim();

  // Check if target user is already a member
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMember = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: existingUser.id, workspaceId } },
    });
    if (existingMember) {
      throw ApiError.conflict('User is already a member of this workspace');
    }
  }

  // Token expires in 7 days
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invitation = await prisma.workspaceInvitation.create({
    data: {
      workspaceId,
      email,
      token,
      role: input.role || 'MEMBER',
      expiresAt,
      createdById: actorUserId,
    },
    include: {
      workspace: { select: { id: true, name: true, logoUrl: true } },
    },
  });

  return invitation;
}

export async function getPendingInvitations(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });

  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw ApiError.forbidden('Only Workspace Owners and Admins can view invitations');
  }

  return prisma.workspaceInvitation.findMany({
    where: { workspaceId, status: 'PENDING' },
    include: {
      createdBy: { select: { id: true, displayName: true, username: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function cancelInvitation(userId: string, workspaceId: string, invitationId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });

  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw ApiError.forbidden('Only Workspace Owners and Admins can cancel invitations');
  }

  await prisma.workspaceInvitation.delete({
    where: { id: invitationId },
  });
}

export async function getInvitationByToken(token: string) {
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { token },
    include: {
      workspace: { select: { id: true, name: true, logoUrl: true, description: true } },
      createdBy: { select: { id: true, displayName: true, username: true } },
    },
  });

  if (!invitation) {
    throw ApiError.notFound('Invalid invitation token');
  }

  if (invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
    throw ApiError.badRequest('Invitation has expired or is no longer valid');
  }

  return invitation;
}

export async function acceptInvitation(userId: string, token: string) {
  const invitation = await getInvitationByToken(token);

  const existingMember = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: invitation.workspaceId } },
  });

  if (existingMember) {
    await prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED' },
    });
    return getWorkspaceByIdOrSlug(userId, invitation.workspaceId);
  }

  const membership = await prisma.$transaction(async (tx) => {
    const m = await tx.workspaceMember.create({
      data: {
        userId,
        workspaceId: invitation.workspaceId,
        role: invitation.role,
      },
    });

    await tx.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED' },
    });

    // Auto-join public channels
    const publicChannels = await tx.channel.findMany({
      where: { workspaceId: invitation.workspaceId, type: 'PUBLIC' },
      select: { id: true },
    });

    for (const ch of publicChannels) {
      await tx.channelMember.upsert({
        where: { userId_channelId: { userId, channelId: ch.id } },
        update: {},
        create: { userId, channelId: ch.id, role: 'MEMBER' },
      });
    }

    return m;
  });

  return getWorkspaceByIdOrSlug(userId, invitation.workspaceId);
}

export async function rejectInvitation(token: string) {
  const invitation = await getInvitationByToken(token);

  await prisma.workspaceInvitation.update({
    where: { id: invitation.id },
    data: { status: 'REJECTED' },
  });
}

export async function exportWorkspaceData(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership) {
    throw ApiError.forbidden('You do not have access to this workspace');
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: {
        include: {
          user: { select: { id: true, username: true, displayName: true, email: true } },
        },
      },
      channels: {
        include: {
          members: {
            include: {
              user: { select: { id: true, username: true, displayName: true } },
            },
          },
          messages: {
            include: {
              user: { select: { id: true, username: true, displayName: true } },
              attachments: true,
              reactions: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });

  if (!workspace) {
    throw ApiError.notFound('Workspace not found');
  }

  return {
    exportedAt: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description,
      createdAt: workspace.createdAt,
    },
    membersCount: workspace.members.length,
    channelsCount: workspace.channels.length,
    members: workspace.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      user: m.user,
    })),
    channels: workspace.channels.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      type: c.type,
      description: c.description,
      members: c.members.map((cm) => cm.user),
      messages: c.messages.map((msg) => ({
        id: msg.id,
        sender: msg.user,
        content: msg.content,
        createdAt: msg.createdAt,
        attachments: msg.attachments,
        reactions: msg.reactions,
      })),
    })),
  };
}

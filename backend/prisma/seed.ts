import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...\n');

  // ─── Create Users ──────────────────────────────────
  const passwordHash = await bcrypt.hash('Password123', 12);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'sarah@devchat.io' },
      update: {},
      create: {
        email: 'sarah@devchat.io',
        username: 'sarah_dev',
        displayName: 'Sarah Chen',
        passwordHash,
        avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Sarah&backgroundColor=6c5ce7',
        statusText: '🚀 Building something awesome',
      },
    }),
    prisma.user.upsert({
      where: { email: 'alex@devchat.io' },
      update: {},
      create: {
        email: 'alex@devchat.io',
        username: 'alex_lead',
        displayName: 'Alex Rivera',
        passwordHash,
        avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Alex&backgroundColor=00b894',
        statusText: '☕ Fueled by coffee',
      },
    }),
    prisma.user.upsert({
      where: { email: 'priya@devchat.io' },
      update: {},
      create: {
        email: 'priya@devchat.io',
        username: 'priya_ui',
        displayName: 'Priya Sharma',
        passwordHash,
        avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Priya&backgroundColor=e17055',
        statusText: '🎨 Pixels and code',
      },
    }),
    prisma.user.upsert({
      where: { email: 'abhishekhshah@gmail.com' },
      update: {},
      create: {
        email: 'abhishekhshah@gmail.com',
        username: 'abhishekhshah',
        displayName: 'Abhishek Shah',
        passwordHash,
        avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Abhishek&backgroundColor=6c5ce7',
        statusText: '🚀 Full Stack Developer',
      },
    }),
    prisma.user.upsert({
      where: { email: 'marcus@devchat.io' },
      update: {},
      create: {
        email: 'marcus@devchat.io',
        username: 'marcus_ops',
        displayName: 'Marcus Johnson',
        passwordHash,
        avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Marcus&backgroundColor=0984e3',
        statusText: '🔧 DevOps & Cloud',
      },
    }),
    prisma.user.upsert({
      where: { email: 'emma@devchat.io' },
      update: {},
      create: {
        email: 'emma@devchat.io',
        username: 'emma_pm',
        displayName: 'Emma Wilson',
        passwordHash,
        avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Emma&backgroundColor=fdcb6e',
        statusText: '📋 Shipping features',
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} users`);

  // ─── Create Default Workspace ──────────────────────
  const defaultWorkspace = await prisma.workspace.upsert({
    where: { slug: 'devchat-org' },
    update: {},
    create: {
      name: 'DevChat Workspace',
      slug: 'devchat-org',
      inviteCode: 'DEVCHAT-2026-INVITE',
      createdById: users[0].id,
      logoUrl: 'https://api.dicebear.com/9.x/identicon/svg?seed=DevChatOrg',
    },
  });

  for (const user of users) {
    await prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: defaultWorkspace.id } },
      update: {},
      create: {
        userId: user.id,
        workspaceId: defaultWorkspace.id,
        role: user.id === users[0].id ? 'OWNER' : user.id === users[1].id ? 'ADMIN' : 'MEMBER',
      },
    });
  }

  console.log(`✅ Created Workspace "${defaultWorkspace.name}" with members`);

  // ─── Create Channels ──────────────────────────────
  const channels = await Promise.all([
    prisma.channel.upsert({
      where: { slug: 'general' },
      update: { workspaceId: defaultWorkspace.id },
      create: {
        name: 'general',
        slug: 'general',
        description: 'Company-wide announcements and general conversation',
        type: 'PUBLIC',
        createdById: users[0].id,
        workspaceId: defaultWorkspace.id,
      },
    }),
    prisma.channel.upsert({
      where: { slug: 'random' },
      update: { workspaceId: defaultWorkspace.id },
      create: {
        name: 'random',
        slug: 'random',
        description: 'Non-work banter and water cooler conversation',
        type: 'PUBLIC',
        createdById: users[1].id,
        workspaceId: defaultWorkspace.id,
      },
    }),
    prisma.channel.upsert({
      where: { slug: 'engineering' },
      update: { workspaceId: defaultWorkspace.id },
      create: {
        name: 'engineering',
        slug: 'engineering',
        description: 'Technical discussions, code reviews, and architecture decisions',
        type: 'PUBLIC',
        createdById: users[0].id,
        workspaceId: defaultWorkspace.id,
      },
    }),
    prisma.channel.upsert({
      where: { slug: 'design' },
      update: { workspaceId: defaultWorkspace.id },
      create: {
        name: 'design',
        slug: 'design',
        description: 'UI/UX discussions, design reviews, and feedback',
        type: 'PUBLIC',
        createdById: users[2].id,
        workspaceId: defaultWorkspace.id,
      },
    }),
    prisma.channel.upsert({
      where: { slug: 'devops' },
      update: { workspaceId: defaultWorkspace.id },
      create: {
        name: 'devops',
        slug: 'devops',
        description: 'Infrastructure, deployments, and monitoring',
        type: 'PUBLIC',
        createdById: users[3].id,
        workspaceId: defaultWorkspace.id,
      },
    }),
  ]);

  console.log(`✅ Created ${channels.length} channels`);

  // ─── Add Members to Channels ──────────────────────
  const memberData: { userId: string; channelId: string; role: 'ADMIN' | 'MEMBER' }[] = [];

  // Everyone joins #general and #random
  for (const user of users) {
    memberData.push(
      { userId: user.id, channelId: channels[0].id, role: user.id === users[0].id ? 'ADMIN' : 'MEMBER' },
      { userId: user.id, channelId: channels[1].id, role: user.id === users[1].id ? 'ADMIN' : 'MEMBER' }
    );
  }

  // Engineering: Sarah, Alex, Marcus
  [users[0], users[1], users[3]].forEach((user) => {
    memberData.push({
      userId: user.id,
      channelId: channels[2].id,
      role: user.id === users[0].id ? 'ADMIN' : 'MEMBER',
    });
  });

  // Design: Priya, Sarah, Emma
  [users[2], users[0], users[4]].forEach((user) => {
    memberData.push({
      userId: user.id,
      channelId: channels[3].id,
      role: user.id === users[2].id ? 'ADMIN' : 'MEMBER',
    });
  });

  // DevOps: Marcus, Alex
  [users[3], users[1]].forEach((user) => {
    memberData.push({
      userId: user.id,
      channelId: channels[4].id,
      role: user.id === users[3].id ? 'ADMIN' : 'MEMBER',
    });
  });

  for (const data of memberData) {
    await prisma.channelMember.upsert({
      where: { userId_channelId: { userId: data.userId, channelId: data.channelId } },
      update: {},
      create: data,
    });
  }

  console.log(`✅ Added ${memberData.length} channel memberships`);

  // ─── Seed Messages ────────────────────────────────
  const generalMessages = [
    { userId: users[0].id, content: 'Hey everyone! Welcome to DevChat 🎉 Our new team communication platform is live!' },
    { userId: users[1].id, content: 'This looks amazing! Great work on the UI @sarah_dev' },
    { userId: users[2].id, content: 'Love the dark theme! The color palette is 🔥' },
    { userId: users[3].id, content: 'Infrastructure is all set up. PostgreSQL and Redis are running smoothly.' },
    { userId: users[4].id, content: 'Quick reminder: Sprint planning is tomorrow at 10am. Please update your tickets!' },
    { userId: users[0].id, content: 'Just pushed the latest update. Real-time messaging is now working with Socket.io!' },
    { userId: users[1].id, content: 'Tested it across multiple tabs — presence indicators are working perfectly 👍' },
    { userId: users[2].id, content: 'Can we add emoji reactions to messages? Would be a nice feature for v2' },
    { userId: users[4].id, content: 'Added it to the backlog! We\'ll prioritize it for next sprint' },
    { userId: users[3].id, content: 'Monitoring dashboard shows zero latency issues so far. Redis pub/sub is handling the load well.' },
    { userId: users[0].id, content: 'Great to hear! Next up: implementing thread support for better conversation organization' },
    { userId: users[1].id, content: 'Also thinking about adding search functionality. PostgreSQL full-text search should work well for this.' },
  ];

  const engineeringMessages = [
    { userId: users[0].id, content: 'PR #42 is ready for review — refactored the WebSocket handler to support rooms' },
    { userId: users[1].id, content: 'Looking at it now. Quick question: why did you choose `@socket.io/redis-adapter` over `socket.io-redis`?' },
    { userId: users[0].id, content: 'The old `socket.io-redis` is deprecated. The new adapter has better TypeScript support and Redis Streams integration' },
    { userId: users[3].id, content: 'Makes sense. Also, I noticed we should add connection pooling for Prisma in production. Currently using singleton but we need to configure pool size.' },
    { userId: users[0].id, content: 'Good catch! I\'ll add that to the config. Default pool size is 5 connections, we should bump it to 20 for production.' },
    { userId: users[1].id, content: 'Approved the PR ✅ Clean code, good test coverage. Ship it!' },
  ];

  const randomMessages = [
    { userId: users[2].id, content: 'Anyone watching the new season of that show? No spoilers please! 📺' },
    { userId: users[4].id, content: 'The office coffee machine is broken again... ☕😭' },
    { userId: users[1].id, content: 'I brought my French press today. Crisis averted! 😄' },
    { userId: users[3].id, content: 'Fun fact: our Redis instance has processed 10,000 messages today' },
    { userId: users[0].id, content: 'That\'s awesome! Let\'s celebrate when we hit 100k 🎊' },
  ];

  const designMessages = [
    { userId: users[2].id, content: 'Updated the design system — new color tokens and spacing scale are in Figma' },
    { userId: users[0].id, content: 'The glassmorphism effects look stunning! How do we handle it for users who prefer reduced motion?' },
    { userId: users[2].id, content: 'Good point! I\'ll add a `prefers-reduced-motion` media query to tone down animations for accessibility' },
    { userId: users[4].id, content: 'Love the new message bubbles! They feel much more polished than before' },
  ];

  const allMessages = [
    ...generalMessages.map((m, i) => ({ ...m, channelId: channels[0].id, delay: i })),
    ...engineeringMessages.map((m, i) => ({ ...m, channelId: channels[2].id, delay: i })),
    ...randomMessages.map((m, i) => ({ ...m, channelId: channels[1].id, delay: i })),
    ...designMessages.map((m, i) => ({ ...m, channelId: channels[3].id, delay: i })),
  ];

  // Create messages with staggered timestamps
  const baseTime = new Date();
  baseTime.setHours(baseTime.getHours() - 24); // Start from 24 hours ago

  for (let i = 0; i < allMessages.length; i++) {
    const { channelId, userId, content, delay } = allMessages[i];
    const messageTime = new Date(baseTime.getTime() + (delay * 15 * 60 * 1000)); // 15 min intervals

    await prisma.message.create({
      data: {
        content,
        userId,
        channelId,
        createdAt: messageTime,
        updatedAt: messageTime,
      },
    });
  }

  console.log(`✅ Created ${allMessages.length} messages`);

  // ─── Create a DM Channel ─────────────────────────
  const dmSlug = `dm-${users[0].id.slice(0, 8)}-${users[1].id.slice(0, 8)}`;
  const dmChannel = await prisma.channel.upsert({
    where: { slug: dmSlug },
    update: {},
    create: {
      name: `${users[0].username}-${users[1].username}`,
      slug: dmSlug,
      type: 'DIRECT',
      createdById: users[0].id,
    },
  });

  for (const mData of [
    { userId: users[0].id, channelId: dmChannel.id, role: 'ADMIN' as const },
    { userId: users[1].id, channelId: dmChannel.id, role: 'MEMBER' as const },
  ]) {
    await prisma.channelMember.upsert({
      where: { userId_channelId: { userId: mData.userId, channelId: mData.channelId } },
      update: {},
      create: mData,
    });
  }

  const dmMessages = [
    { userId: users[0].id, content: 'Hey Alex, can you review my PR when you get a chance?' },
    { userId: users[1].id, content: 'Sure! I\'ll take a look after lunch. Is it urgent?' },
    { userId: users[0].id, content: 'Not super urgent, but would be nice to get it merged before end of day' },
    { userId: users[1].id, content: 'Got it, I\'ll prioritize it 👍' },
  ];

  for (let i = 0; i < dmMessages.length; i++) {
    const { userId, content } = dmMessages[i];
    const messageTime = new Date(baseTime.getTime() + ((i + 20) * 15 * 60 * 1000));

    await prisma.message.create({
      data: {
        content,
        userId,
        channelId: dmChannel.id,
        createdAt: messageTime,
        updatedAt: messageTime,
      },
    });
  }

  console.log(`✅ Created DM channel with ${dmMessages.length} messages`);

  console.log('\n✅ Database seeding completed!\n');
  console.log('Demo accounts (all use password "Password123"):');
  users.forEach((u) => {
    console.log(`   📧 ${u.email} (${u.displayName})`);
  });
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

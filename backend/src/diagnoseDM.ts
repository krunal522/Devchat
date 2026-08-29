import { prisma } from './config/database.js';

async function diagnose() {
  console.log('=== Diagnosing DM Channel Issues ===\n');

  const dmChannels = await prisma.channel.findMany({
    where: { type: 'DIRECT' },
    include: {
      members: {
        include: {
          user: { select: { id: true, username: true } }
        }
      },
      messages: {
        select: { id: true, content: true, createdAt: true, userId: true },
        orderBy: { createdAt: 'desc' },
        take: 3
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`Total DM channels: ${dmChannels.length}\n`);

  const pairMap = new Map<string, typeof dmChannels>();

  for (const ch of dmChannels) {
    const userIds = ch.members.map(m => m.user.id).sort();
    const key = userIds.join('|');
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key)!.push(ch);
  }

  for (const [pair, channels] of pairMap.entries()) {
    const usernames = channels[0].members.map(m => m.user.username);
    console.log(`\nPair [${usernames.join(' ↔ ')}] → ${channels.length} DM channel(s):`);
    for (const ch of channels) {
      const sortedIds = ch.members.map(m => m.user.id).sort();
      const expectedSlug = `dm-${sortedIds[0]}-${sortedIds[1]}`;
      console.log(`  Channel ID: ${ch.id}`);
      console.log(`  Slug: ${ch.slug} ${ch.slug === expectedSlug ? '✅ canonical' : '❌ NOT canonical (expected: ' + expectedSlug + ')'}`);
      console.log(`  Members: ${ch.members.map(m => m.user.username).join(', ')}`);
      console.log(`  Messages: ${ch.messages.length} recent`);
      ch.messages.forEach(m => console.log(`    - [${m.createdAt.toISOString()}] userId=${m.userId}: ${m.content?.slice(0, 40)}`));
    }

    if (channels.length > 1) {
      console.log(`  ⚠️ DUPLICATE DETECTED! These need to be merged.`);
    }
  }

  console.log('\n=== Done ===');
  process.exit(0);
}

diagnose().catch(err => { console.error(err); process.exit(1); });

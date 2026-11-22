import { prisma } from '../lib/prisma';

/**
 * Startup recovery: marks materials stuck in PENDING for more than 10 minutes
 * as FAILED with a failureReason ("Processing was interrupted").
 */
export async function recoverStalePendingMaterials(): Promise<void> {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const result = await prisma.material.updateMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: tenMinutesAgo },
      },
      data: {
        status: 'FAILED',
        failureReason: 'Processing was interrupted',
      },
    });

    if (result.count > 0) {
      console.log(
        `[Startup Recovery] Marked ${result.count} stale PENDING material(s) as FAILED.`
      );
    }
  } catch (err: any) {
    console.error('[Startup Recovery] Failed to recover stale materials:', err.message);
  }
}

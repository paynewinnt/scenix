import type { RunQueueBlockedReason, TestRun } from '../services/api';

const blockedReasonLabels: Record<RunQueueBlockedReason, string> = {
  awaiting_dispatch: '等待调度器接管',
  waiting_web_slot: '等待 Web 全局槽位',
  waiting_device_busy: '等待目标设备空闲',
  waiting_same_resource_queue: '等待同资源前序任务',
  device_disconnected: '目标设备已断开，等待重新连接',
};

export function buildQueueStatusSummary(run: Pick<TestRun, 'status' | 'queuePosition' | 'blockedReason'>): string {
  if (run.status !== 'queued') {
    return '-';
  }

  const parts: string[] = [];
  if (typeof run.queuePosition === 'number') {
    parts.push(`同资源第 ${run.queuePosition} 位`);
  }

  if (run.blockedReason) {
    parts.push(blockedReasonLabels[run.blockedReason] ?? run.blockedReason);
  }

  return parts.join(' · ') || '等待调度中';
}

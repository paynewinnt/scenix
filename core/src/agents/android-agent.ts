/**
 * Android Agent - Midscene.js Android SDK integration
 *
 * Uses @midscene/android to control Android devices via adb
 * with natural language instructions powered by VLM.
 */

export interface AndroidAgentOptions {
  udid?: string;
  aiActionContext?: string;
  autoDismissKeyboard?: boolean;
}

export async function createAndroidAgent(options: AndroidAgentOptions = {}) {
  // @ts-expect-error -- @midscene/android may not have type declarations
  const { AndroidAgent, AndroidDevice, getConnectedDevices } = await import('@midscene/android');

  const devices = await getConnectedDevices();
  if (devices.length === 0) {
    throw new Error('No Android devices connected. Please connect a device and enable USB debugging.');
  }

  const targetUdid = options.udid ?? devices[0].udid;
  const device = new AndroidDevice(targetUdid);

  const agent = new AndroidAgent(device, {
    aiActionContext:
      options.aiActionContext ??
      'If any location, permission, or user agreement dialog appears, tap agree/allow.',
    autoDismissKeyboard: options.autoDismissKeyboard ?? true,
  });

  return {
    agent,
    device,

    async aiAction(instruction: string): Promise<void> {
      await agent.aiAction(instruction);
    },

    async aiAssert(assertion: string): Promise<void> {
      await agent.aiAssert(assertion);
    },

    async aiQuery<T>(dataShape: string, instruction: string): Promise<T> {
      return agent.aiQuery(dataShape, { prompt: instruction });
    },

    async destroy(): Promise<void> {
      await agent.destroy();
    },
  };
}

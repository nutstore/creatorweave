export interface InvalidModelAutoEnableDecision {
  shouldEnable: boolean
  key: string | null
  normalizedModelName: string
}

interface InvalidModelAutoEnableArgs {
  providerKey: string
  modelName: string
  availableModelIds: readonly string[]
  handledInvalidModelKeys: ReadonlySet<string>
}

export function getInvalidModelAutoEnableDecision({
  providerKey,
  modelName,
  availableModelIds,
  handledInvalidModelKeys,
}: InvalidModelAutoEnableArgs): InvalidModelAutoEnableDecision {
  const normalizedModelName = modelName.trim()
  if (!normalizedModelName) {
    return {
      shouldEnable: false,
      key: null,
      normalizedModelName: '',
    }
  }

  if (availableModelIds.includes(normalizedModelName)) {
    return {
      shouldEnable: false,
      key: null,
      normalizedModelName,
    }
  }

  const key = `${providerKey}:${normalizedModelName}`
  if (handledInvalidModelKeys.has(key)) {
    return {
      shouldEnable: false,
      key,
      normalizedModelName,
    }
  }

  return {
    shouldEnable: true,
    key,
    normalizedModelName,
  }
}

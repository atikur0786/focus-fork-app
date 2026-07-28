import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ModelOption } from '../components/ModelSelector'
import {
  filterSelectableModels,
  pickDefaultModel,
  ZERO_COST_DEFAULT_MODEL
} from '../lib/model-entitlements'
import { mapPlatformModels, type PlatformModelOption } from '../lib/platform-models'
import { isModelSelectable } from '../lib/model-catalog'
import { useAIStore } from '../store/useAIStore'

function buildSelectorOptions(
  catalog: PlatformModelOption[],
  selectable: PlatformModelOption[],
  fallbackModel: string
): ModelOption[] {
  if (catalog.length === 0) {
    return [{ id: fallbackModel, label: fallbackModel || 'Default model', tierLabel: 'Configured', available: true }]
  }
  const selectableIds = new Set(selectable.map((item) => item.id))
  return catalog.map((item) => ({
    id: item.id,
    label: item.label,
    provider: item.provider,
    costLabel: item.costLabel,
    tierLabel: item.tierLabel,
    category: item.category,
    available: item.available,
    inputCostPerM: item.inputCostPerM,
    outputCostPerM: item.outputCostPerM,
    disabled: !selectableIds.has(item.id)
  }))
}

/** Shared model catalog + plan gating for workspace chat and Settings (same rules everywhere). */
export function useManagedModelCatalog(options?: { autoLoad?: boolean; enabled?: boolean }) {
  const autoLoad = options?.autoLoad !== false
  const enabled = options?.enabled !== false
  const { model, setModel } = useAIStore()
  const [billingPlan, setBillingPlan] = useState<string>('free')
  const [modelCatalog, setModelCatalog] = useState<PlatformModelOption[]>([])
  const [loading, setLoading] = useState(false)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const [modelsPayload, planPayload] = await Promise.all([
        window.api.platform.aiModels(),
        window.api.platform.billingPlan().catch(() => ({ plan: 'free' }))
      ])
      const plan = String((planPayload as { plan?: string })?.plan || 'free')
      setBillingPlan(plan)
      const items = Array.isArray(modelsPayload?.items) ? modelsPayload.items : []
      const mapped = mapPlatformModels(items)
      setModelCatalog(mapped.length > 0 ? mapped : [])
      const currentModel = useAIStore.getState().model
      const nextModel = pickDefaultModel(mapped, plan, currentModel)
      if (nextModel !== currentModel) {
        setModel(nextModel)
      }
    } catch {
      setBillingPlan('free')
      setModelCatalog([])
      const current = useAIStore.getState().model
      if (current !== ZERO_COST_DEFAULT_MODEL) {
        setModel(ZERO_COST_DEFAULT_MODEL)
      }
    } finally {
      setLoading(false)
    }
  }, [setModel])

  useEffect(() => {
    if (!autoLoad || !enabled) return
    void loadCatalog()
  }, [autoLoad, enabled, loadCatalog])

  const selectableModels = useMemo(
    () => filterSelectableModels(modelCatalog, billingPlan),
    [modelCatalog, billingPlan]
  )

  const modelSelectorOptions = useMemo(
    () => buildSelectorOptions(modelCatalog, selectableModels, model),
    [modelCatalog, selectableModels, model]
  )

  const selectableIds = useMemo(
    () => new Set(selectableModels.map((item) => item.id)),
    [selectableModels]
  )

  useEffect(() => {
    if (selectableModels.length === 0) return
    if (!selectableIds.has(model)) {
      setModel(pickDefaultModel(modelCatalog, billingPlan, model))
    }
  }, [selectableModels, selectableIds, model, modelCatalog, billingPlan, setModel])

  const setModelSafe = useCallback(
    (modelId: string) => {
      const option = modelSelectorOptions.find((entry) => entry.id === modelId)
      if (option && !isModelSelectable(option)) return
      if (!selectableIds.has(modelId)) return
      setModel(modelId)
    },
    [modelSelectorOptions, selectableIds, setModel]
  )

  return {
    model,
    setModel: setModelSafe,
    billingPlan,
    modelCatalog,
    modelSelectorOptions,
    selectableModels,
    loading,
    reloadCatalog: loadCatalog
  }
}

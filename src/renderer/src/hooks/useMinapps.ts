import { DEFAULT_MIN_APPS } from '@renderer/config/minapps'
import { RootState, useAppDispatch, useAppSelector } from '@renderer/store'
import { setDisabledMinApps, setMinApps, setPinnedMinApps } from '@renderer/store/minapps'
import { MinAppType } from '@renderer/types'

export const useMinapps = () => {
  const { enabled, disabled, pinned } = useAppSelector((state: RootState) => state.minapps)
  const dispatch = useAppDispatch()

  const disabledMinappsIds = ['openai', 'baidu-ai-chat', 'baidu-ai-search']

  return {
    minapps: enabled
      .map((app) => DEFAULT_MIN_APPS.find((item) => item.id === app.id) || app)
      .filter((app) => !disabledMinappsIds.includes(app.id)),
    disabled: disabled
      .map((app) => DEFAULT_MIN_APPS.find((item) => item.id === app.id) || app)
      .filter((app) => !disabledMinappsIds.includes(app.id)),
    pinned: pinned
      .map((app) => DEFAULT_MIN_APPS.find((item) => item.id === app.id) || app)
      .filter((app) => !disabledMinappsIds.includes(app.id)),
    updateMinapps: (minapps: MinAppType[]) => {
      dispatch(setMinApps(minapps))
    },
    updateDisabledMinapps: (minapps: MinAppType[]) => {
      dispatch(setDisabledMinApps(minapps))
    },
    updatePinnedMinapps: (minapps: MinAppType[]) => {
      dispatch(setPinnedMinApps(minapps))
    }
  }
}

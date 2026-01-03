import { Button } from './ui/button'
import { Switch } from './ui/switch'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Settings, Monitor, Car } from 'lucide-react'

interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  speedUnit: 'mph' | 'kmh'
  onSpeedUnitChange: (unit: 'mph' | 'kmh') => void
}

export function SettingsPanel({
  open,
  onOpenChange,
  speedUnit,
  onSpeedUnitChange,
}: SettingsPanelProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 max-h-[85vh] bg-neutral-900 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
            <Dialog.Title className="text-lg font-semibold text-white flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="w-4 h-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* Display Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                Display
              </h3>

              <div className="space-y-3 pl-2">
                <label className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">Speed unit</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={speedUnit === 'mph' ? 'text-white' : 'text-neutral-500'}>mph</span>
                    <Switch
                      checked={speedUnit === 'kmh'}
                      onCheckedChange={(checked) => onSpeedUnitChange(checked ? 'kmh' : 'mph')}
                    />
                    <span className={speedUnit === 'kmh' ? 'text-white' : 'text-neutral-500'}>km/h</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Playback Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                <Car className="w-4 h-4" />
                Playback
              </h3>

              <div className="space-y-3 pl-2">
                <p className="text-xs text-neutral-500">
                  Additional playback settings coming soon.
                </p>
              </div>
            </div>

            {/* About */}
            <div className="pt-4 border-t border-neutral-800">
              <p className="text-xs text-neutral-500 text-center">
                TeslaCam Viewer v1.0
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

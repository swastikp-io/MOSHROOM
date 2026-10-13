import { useState } from 'react';
import { CameraDevice } from '../core/camera';
import { PRESETS } from '../presets/datamoshPresets';
import { InputResolution, MoshSettings, Preset } from '../types/datamosh';
import {
  ChevronRight,
  ChevronDown,
  Sliders,
  RotateCcw,
  Zap,
  Sparkles,
  Camera,
  Layers,
  Dice5,
  Eye,
  EyeOff,
} from 'lucide-react';

interface ControlsProps {
  settings: MoshSettings;
  onUpdateSettings: (updater: (prev: MoshSettings) => MoshSettings) => void;
  onResetBuffer: () => void;
  onRestoreDefaults: () => void;
  devices: CameraDevice[];
  activeDeviceId: string;
  isSynthetic: boolean;
  onSelectCamera: (deviceId: string) => void;
  onSwitchToSynthetic: () => void;
  onChangeResolution: (resolution: InputResolution) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

type TabType = 'presets' | 'datamosh' | 'image' | 'motion' | 'input' | 'advanced';

export function Controls({
  settings,
  onUpdateSettings,
  onResetBuffer,
  onRestoreDefaults,
  devices,
  activeDeviceId,
  isSynthetic,
  onSelectCamera,
  onSwitchToSynthetic,
  onChangeResolution,
  isCollapsed,
  onToggleCollapse,
}: ControlsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('presets');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);

  const applyPreset = (preset: Preset) => {
    onUpdateSettings((prev) => ({
      ...prev,
      ...preset.settings,
    }));
    onResetBuffer();
  };

  const triggerCorruptBurst = () => {
    const burstMagnitude = (settings.corruptionBurstAmount / 100.0);
    const origCorrupt = settings.corruptFrequency;
    const origDisplace = settings.displacementStrength;
    const origTear = settings.horizontalTear;

    onUpdateSettings((s) => ({
      ...s,
      corruptFrequency: Math.min(100, origCorrupt + 60 * burstMagnitude),
      displacementStrength: Math.min(100, origDisplace + 50 * burstMagnitude),
      horizontalTear: Math.min(1.0, origTear + 0.6 * burstMagnitude),
    }));

    setTimeout(() => {
      onUpdateSettings((s) => ({
        ...s,
        corruptFrequency: origCorrupt,
        displacementStrength: origDisplace,
        horizontalTear: origTear,
      }));
    }, 450);
  };

  const rerollSeed = () => {
    const newSeed = Math.floor(Math.random() * 9999);
    onUpdateSettings((s) => ({ ...s, randomSeed: newSeed }));
  };

  if (isCollapsed) {
    return (
      <div className="border-l border-black bg-white flex flex-col items-center py-3 px-1 select-none z-20">
        <button
          onClick={onToggleCollapse}
          className="p-1 border border-black hover:bg-neutral-100 cursor-pointer"
          title="Expand Control Panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="font-mono text-[10px] uppercase font-bold tracking-widest mt-6 [writing-mode:vertical-lr] rotate-180">
          PARAMETERS
        </span>
      </div>
    );
  }

  return (
    <aside className="w-80 md:w-96 border-l border-black bg-white flex flex-col select-none z-20 shrink-0 font-mono text-xs">
      {/* Header */}
      <div className="h-10 border-b border-black px-3 flex items-center justify-between bg-white shrink-0">
        <span className="font-bold tracking-wider uppercase text-[11px] flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5" />
          PARAMETER PANEL
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onRestoreDefaults}
            className="px-2 py-0.5 border border-black text-[10px] hover:bg-neutral-100 cursor-pointer uppercase font-bold"
            title="Reset All Parameters to Default"
          >
            RESET ALL
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1 border border-black hover:bg-neutral-100 cursor-pointer"
            title="Collapse Panel"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-black bg-neutral-50 text-[10px] overflow-x-auto shrink-0">
        <button
          onClick={() => setActiveTab('presets')}
          className={`py-2 px-2.5 text-center font-bold tracking-wider uppercase border-r border-black cursor-pointer whitespace-nowrap transition-colors ${
            activeTab === 'presets' ? 'bg-white text-black' : 'text-neutral-500 hover:text-black'
          }`}
        >
          PRESETS
        </button>
        <button
          onClick={() => setActiveTab('input')}
          className={`py-2 px-2.5 text-center font-bold tracking-wider uppercase border-r border-black cursor-pointer whitespace-nowrap transition-colors ${
            activeTab === 'input' ? 'bg-white text-black' : 'text-neutral-500 hover:text-black'
          }`}
        >
          INPUT
        </button>
        <button
          onClick={() => setActiveTab('datamosh')}
          className={`py-2 px-2.5 text-center font-bold tracking-wider uppercase border-r border-black cursor-pointer whitespace-nowrap transition-colors ${
            activeTab === 'datamosh' ? 'bg-white text-black' : 'text-neutral-500 hover:text-black'
          }`}
        >
          DATAMOSH
        </button>
        <button
          onClick={() => setActiveTab('image')}
          className={`py-2 px-2.5 text-center font-bold tracking-wider uppercase border-r border-black cursor-pointer whitespace-nowrap transition-colors ${
            activeTab === 'image' ? 'bg-white text-black' : 'text-neutral-500 hover:text-black'
          }`}
        >
          IMAGE
        </button>
        <button
          onClick={() => setActiveTab('motion')}
          className={`py-2 px-2.5 text-center font-bold tracking-wider uppercase cursor-pointer whitespace-nowrap transition-colors ${
            activeTab === 'motion' ? 'bg-white text-black' : 'text-neutral-500 hover:text-black'
          }`}
        >
          MOTION
        </button>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* ============================================================== */}
        {/* PRESETS TAB */}
        {/* ============================================================== */}
        {activeTab === 'presets' && (
          <div className="space-y-3">
            <div className="text-[10px] text-neutral-400 uppercase tracking-widest font-semibold pb-1 border-b border-neutral-200">
              TARGET ARTISTIC PRESETS
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className="p-3 border border-black bg-white space-y-2 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {preset.name}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => applyPreset(preset)}
                        className="px-2 py-0.5 bg-black text-white hover:bg-neutral-800 text-[10px] uppercase font-bold cursor-pointer"
                        title="Load Preset Settings"
                      >
                        APPLY
                      </button>
                      <button
                        onClick={() => applyPreset(preset)}
                        className="px-2 py-0.5 border border-black hover:bg-neutral-100 text-[10px] uppercase font-bold cursor-pointer flex items-center gap-1"
                        title="One-click Reset to Preset"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        RESET
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-600 leading-relaxed font-sans">
                    {preset.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 1. INPUT TAB */}
        {/* ============================================================== */}
        {activeTab === 'input' && (
          <div className="space-y-4">
            {/* Camera device selector */}
            <div className="space-y-1.5">
              <label htmlFor="input-camera-select" className="font-semibold uppercase text-[11px] flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                VIDEO INPUT DEVICE
              </label>
              <select
                id="input-camera-select"
                value={isSynthetic ? 'synth' : activeDeviceId}
                onChange={(e) => {
                  if (e.target.value === 'synth') {
                    onSwitchToSynthetic();
                  } else {
                    onSelectCamera(e.target.value);
                  }
                }}
                className="w-full border border-black bg-white p-2 text-xs font-mono outline-none cursor-pointer"
              >
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera (${device.deviceId.slice(0, 8)}...)`}
                  </option>
                ))}
                {devices.length === 0 && !isSynthetic && (
                  <option value="">Default Web Camera</option>
                )}
                <option value="synth">SYNTHETIC TEST SUBJECT (NO WEBCAM)</option>
              </select>
            </div>

            {/* Input resolution selector */}
            <div className="space-y-1.5">
              <label htmlFor="input-res-select" className="font-semibold uppercase text-[11px] block">
                INPUT RESOLUTION
              </label>
              <div className="grid grid-cols-4 gap-1">
                {(['default', '480p', '720p', '1080p'] as InputResolution[]).map((res) => (
                  <button
                    key={res}
                    onClick={() => {
                      onUpdateSettings((s) => ({ ...s, inputResolution: res }));
                      onChangeResolution(res);
                    }}
                    className={`py-1.5 border border-black text-center text-[10px] font-bold uppercase cursor-pointer transition-colors ${
                      settings.inputResolution === res ? 'bg-black text-white' : 'bg-white hover:bg-neutral-100'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            {/* Mirror camera toggle */}
            <div className="border border-black p-3 flex items-center justify-between">
              <div>
                <span className="font-bold uppercase tracking-wider text-xs block">MIRROR CAMERA FEED</span>
                <span className="text-[10px] text-neutral-500 font-sans">
                  Flips camera horizontally (selfie perspective)
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.mirrorCamera}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, mirrorCamera: e.target.checked }))}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 2. DATAMOSH TAB */}
        {/* ============================================================== */}
        {activeTab === 'datamosh' && (
          <div className="space-y-3.5">
            {/* Master intensity: 0–100 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">MASTER INTENSITY</span>
                <span className="font-mono font-bold">{settings.masterIntensity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.masterIntensity}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, masterIntensity: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Temporal feedback: 0–100 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">TEMPORAL FEEDBACK</span>
                <span className="font-mono font-bold">{settings.temporalFeedback}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.temporalFeedback}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, temporalFeedback: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Block size: 2–40 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">BLOCK SIZE</span>
                <span className="font-mono font-bold">{settings.blockSize}px</span>
              </div>
              <input
                type="range"
                min="2"
                max="40"
                step="1"
                value={settings.blockSize}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, blockSize: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Displacement strength: 0–100 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">DISPLACEMENT STRENGTH</span>
                <span className="font-mono font-bold">{settings.displacementStrength}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.displacementStrength}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, displacementStrength: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Motion sensitivity: 0–100 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">MOTION SENSITIVITY</span>
                <span className="font-mono font-bold">{settings.motionSensitivity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.motionSensitivity}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, motionSensitivity: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Smear length: 0–100 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">SMEAR LENGTH</span>
                <span className="font-mono font-bold">{settings.smearLength}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.smearLength}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, smearLength: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Corruption frequency: 0–100 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">CORRUPTION FREQUENCY</span>
                <span className="font-mono font-bold">{settings.corruptFrequency}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.corruptFrequency}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, corruptFrequency: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Color quantization: 2–32 levels */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">COLOR QUANTIZATION</span>
                <span className="font-mono font-bold">{settings.colorLevels} LEVELS</span>
              </div>
              <input
                type="range"
                min="2"
                max="32"
                step="1"
                value={settings.colorLevels}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, colorLevels: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* RGB separation: 0–100 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">RGB SEPARATION</span>
                <span className="font-mono font-bold">{settings.rgbSeparation}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.rgbSeparation}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, rgbSeparation: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Internal resolution scale: 0.1–1.0 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">INTERNAL RESOLUTION SCALE</span>
                <span className="font-mono font-bold">{Math.round(settings.internalResolutionScale * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={settings.internalResolutionScale}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, internalResolutionScale: parseFloat(e.target.value) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 3. IMAGE TAB */}
        {/* ============================================================== */}
        {activeTab === 'image' && (
          <div className="space-y-3.5">
            {/* Saturation */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">SATURATION</span>
                <span className="font-mono font-bold">{(settings.saturation * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="2.0"
                step="0.05"
                value={settings.saturation}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, saturation: parseFloat(e.target.value) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Contrast */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">CONTRAST</span>
                <span className="font-mono font-bold">{settings.contrast.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.05"
                value={settings.contrast}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, contrast: parseFloat(e.target.value) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Brightness */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">BRIGHTNESS</span>
                <span className="font-mono font-bold">{(settings.brightness * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.02"
                value={settings.brightness}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, brightness: parseFloat(e.target.value) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Color tint */}
            <div className="border border-black p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase text-xs">COLOR TINT</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.colorTint}
                    onChange={(e) => onUpdateSettings((s) => ({ ...s, colorTint: e.target.value }))}
                    className="w-7 h-7 border border-black cursor-pointer bg-transparent"
                  />
                  <button
                    onClick={() => onUpdateSettings((s) => ({ ...s, colorTint: '#ffffff' }))}
                    className="px-1.5 py-0.5 border border-black text-[9px] uppercase font-bold hover:bg-neutral-100"
                    title="Neutral white"
                  >
                    RESET
                  </button>
                </div>
              </div>
              {/* Quick tint palette presets */}
              <div className="flex gap-1 pt-1">
                {[
                  { name: 'Neutral', color: '#ffffff' },
                  { name: 'Peach', color: '#f2cab8' },
                  { name: 'Sage', color: '#b0c4b1' },
                  { name: 'Cyan', color: '#c4e0e5' },
                  { name: 'Plum', color: '#d8b4e2' },
                ].map((tint) => (
                  <button
                    key={tint.name}
                    onClick={() => onUpdateSettings((s) => ({ ...s, colorTint: tint.color }))}
                    className="flex-1 py-1 text-[9px] border border-black uppercase font-bold hover:opacity-80"
                    style={{ backgroundColor: tint.color, color: tint.color === '#ffffff' ? '#000000' : '#222222' }}
                  >
                    {tint.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Noise amount */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">NOISE AMOUNT</span>
                <span className="font-mono font-bold">{settings.noiseAmount}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.noiseAmount}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, noiseAmount: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 4. MOTION TAB */}
        {/* ============================================================== */}
        {activeTab === 'motion' && (
          <div className="space-y-3.5">
            {/* Freeze effect animation */}
            <div className="border border-black p-3 flex items-center justify-between">
              <div>
                <span className="font-bold uppercase tracking-wider text-xs block">FREEZE EFFECT ANIMATION</span>
                <span className="text-[10px] text-neutral-500 font-sans">
                  Holds temporal animation time without freezing the webcam
                </span>
              </div>
              <button
                onClick={() => onUpdateSettings((s) => ({ ...s, freezeAnimation: !s.freezeAnimation }))}
                className={`p-1.5 border border-black cursor-pointer transition-colors ${
                  settings.freezeAnimation ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'
                }`}
                title={settings.freezeAnimation ? 'Unfreeze' : 'Freeze'}
              >
                {settings.freezeAnimation ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Animation speed */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">ANIMATION SPEED</span>
                <span className="font-mono font-bold">{settings.animationSpeed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.1"
                value={settings.animationSpeed}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, animationSpeed: parseFloat(e.target.value) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Feedback decay */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">FEEDBACK DECAY</span>
                <span className="font-mono font-bold">{settings.feedbackDecay}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.feedbackDecay}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, feedbackDecay: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Corruption burst amount */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold uppercase">CORRUPTION BURST AMOUNT</span>
                <span className="font-mono font-bold">{settings.corruptionBurstAmount}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.corruptionBurstAmount}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, corruptionBurstAmount: parseInt(e.target.value, 10) }))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Random seed */}
            <div className="border border-black p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold uppercase text-xs block">RANDOM SEED</span>
                  <span className="text-[10px] text-neutral-500 font-sans">
                    Controls procedural displacement distribution
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-neutral-100 px-2 py-0.5 border border-black">
                    #{settings.randomSeed}
                  </span>
                  <button
                    onClick={rerollSeed}
                    className="p-1 border border-black hover:bg-neutral-100 cursor-pointer"
                    title="Reroll procedural seed"
                  >
                    <Dice5 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={triggerCorruptBurst}
                className="w-full py-2.5 bg-black text-white hover:bg-neutral-800 border border-black font-bold uppercase tracking-wider text-[11px] flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Zap className="w-3.5 h-3.5 fill-white" />
                TRIGGER CORRUPT BURST
              </button>

              <button
                onClick={onResetBuffer}
                className="w-full py-2 border border-black bg-white hover:bg-neutral-100 font-bold uppercase tracking-wider text-[10px] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                PURGE ACCUMULATOR
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* COLLAPSIBLE ADVANCED CONTROLS SECTION */}
        {/* ============================================================== */}
        <div className="pt-2 border-t border-black">
          <button
            onClick={() => setIsAdvancedOpen((prev) => !prev)}
            className="w-full py-2 px-2.5 border border-black bg-neutral-50 hover:bg-neutral-100 flex items-center justify-between text-xs font-bold uppercase cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              ADVANCED / PAINTERLY PARAMETERS
            </span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
          </button>

          {isAdvancedOpen && (
            <div className="p-3 border border-t-0 border-black space-y-3 bg-white text-[11px]">
              {/* I-Frame Hold switch */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold uppercase block">I-FRAME KEYFRAME HOLD</span>
                  <span className="text-[10px] text-neutral-500 font-sans">
                    Suppresses I-frames; drags scene through itself
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.iFrameDrop}
                  onChange={(e) => onUpdateSettings((s) => ({ ...s, iFrameDrop: e.target.checked }))}
                  className="w-4 h-4 accent-black cursor-pointer"
                />
              </div>

              {/* Painterly watercolor bleed */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold uppercase">PAINTERLY BLEED</span>
                  <span className="font-mono font-bold">{(settings.painterlyBleed * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={settings.painterlyBleed}
                  onChange={(e) => onUpdateSettings((s) => ({ ...s, painterlyBleed: parseFloat(e.target.value) }))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              {/* Large block mix */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold uppercase">LARGE BLOCK MIX</span>
                  <span className="font-mono font-bold">{(settings.largeBlockMix * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={settings.largeBlockMix}
                  onChange={(e) => onUpdateSettings((s) => ({ ...s, largeBlockMix: parseFloat(e.target.value) }))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              {/* Block irregularity */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold uppercase">BLOCK IRREGULARITY</span>
                  <span className="font-mono font-bold">{(settings.blockIrregularity * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={settings.blockIrregularity}
                  onChange={(e) => onUpdateSettings((s) => ({ ...s, blockIrregularity: parseFloat(e.target.value) }))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              {/* Motion weighting */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold uppercase">MOTION WEIGHTING</span>
                  <span className="font-mono font-bold">{(settings.motionWeight * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={settings.motionWeight}
                  onChange={(e) => onUpdateSettings((s) => ({ ...s, motionWeight: parseFloat(e.target.value) }))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              {/* Palette grading */}
              <div className="flex items-center justify-between pt-1">
                <span className="font-bold uppercase">MUTED PAINTERLY PALETTE</span>
                <input
                  type="checkbox"
                  checked={settings.paletteGrading}
                  onChange={(e) => onUpdateSettings((s) => ({ ...s, paletteGrading: e.target.checked }))}
                  className="w-4 h-4 accent-black cursor-pointer"
                />
              </div>

              {/* Palette intensity */}
              {settings.paletteGrading && (
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-semibold uppercase">PALETTE INTENSITY</span>
                    <span className="font-mono font-bold">{(settings.paletteIntensity * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.02"
                    value={settings.paletteIntensity}
                    onChange={(e) => onUpdateSettings((s) => ({ ...s, paletteIntensity: parseFloat(e.target.value) }))}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>
              )}

              {/* Color tearing */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold uppercase">COLOR TEARING</span>
                  <span className="font-mono font-bold">{(settings.colorTearing * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={settings.colorTearing}
                  onChange={(e) => onUpdateSettings((s) => ({ ...s, colorTearing: parseFloat(e.target.value) }))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              {/* Horizontal tearing */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold uppercase">HORIZONTAL TEARING</span>
                  <span className="font-mono font-bold">{(settings.horizontalTear * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={settings.horizontalTear}
                  onChange={(e) => onUpdateSettings((s) => ({ ...s, horizontalTear: parseFloat(e.target.value) }))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              {/* Displaced regions */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold uppercase">DISPLACED REGIONS</span>
                  <span className="font-mono font-bold">{(settings.displacedRegions * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={settings.displacedRegions}
                  onChange={(e) => onUpdateSettings((s) => ({ ...s, displacedRegions: parseFloat(e.target.value) }))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              {/* Texture sampling mode */}
              <div className="space-y-1 pt-1">
                <span className="font-semibold uppercase block">TEXTURE FILTERING</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => onUpdateSettings((s) => ({ ...s, textureFiltering: 'linear' }))}
                    className={`py-1 border border-black text-[10px] font-bold uppercase cursor-pointer ${
                      settings.textureFiltering === 'linear' ? 'bg-black text-white' : 'bg-white'
                    }`}
                  >
                    LINEAR
                  </button>
                  <button
                    onClick={() => onUpdateSettings((s) => ({ ...s, textureFiltering: 'nearest' }))}
                    className={`py-1 border border-black text-[10px] font-bold uppercase cursor-pointer ${
                      settings.textureFiltering === 'nearest' ? 'bg-black text-white' : 'bg-white'
                    }`}
                  >
                    NEAREST
                  </button>
                </div>
              </div>

              {/* Monochrome & Invert */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={() => onUpdateSettings((s) => ({ ...s, monochrome: !s.monochrome }))}
                  className={`py-1 border border-black text-[10px] font-bold uppercase cursor-pointer ${
                    settings.monochrome ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  MONO [{settings.monochrome ? 'ON' : 'OFF'}]
                </button>
                <button
                  onClick={() => onUpdateSettings((s) => ({ ...s, invert: !s.invert }))}
                  className={`py-1 border border-black text-[10px] font-bold uppercase cursor-pointer ${
                    settings.invert ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  INVERT [{settings.invert ? 'ON' : 'OFF'}]
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer shortcut hints */}
      <div className="p-2 border-t border-black bg-neutral-50 text-[10px] text-neutral-500 flex justify-between shrink-0">
        <span>SPACE: BYPASS</span>
        <span>D: I-FRAME</span>
        <span>R: RESET</span>
      </div>
    </aside>
  );
}

// src/components/admin/GatingConfig.jsx
// Admin component for configuring season gating requirements

import { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Lock, Eye, EyeOff, Trash2, Plus, ShieldCheck } from 'lucide-react';
import { hashPassword, GateType } from '@/hooks/useSeasonGating';

/**
 * GatingConfig - Component for configuring season participation requirements
 * @param {Object} props
 * @param {boolean} props.gated - Whether gating is enabled
 * @param {Function} props.onGatedChange - Callback when gated toggle changes
 * @param {Function} props.onGatesChange - Callback when gates configuration changes
 */
const GatingConfig = ({ gated, onGatedChange, onGatesChange }) => {
  const { t } = useTranslation('admin');

  // Local state for password gates
  const [passwordGates, setPasswordGates] = useState([
    { password: '', enabled: true, showPassword: false }
  ]);

  // Update parent when gates change
  const updateParent = useCallback((gates) => {
    if (onGatesChange) {
      // Convert to contract format
      const formattedGates = gates
        .filter(g => g.password.trim().length > 0)
        .map(g => ({
          gateType: GateType.PASSWORD,
          enabled: g.enabled,
          configHash: hashPassword(g.password),
        }));
      onGatesChange(formattedGates);
    }
  }, [onGatesChange]);

  // Handle password change
  const handlePasswordChange = useCallback((index, value) => {
    setPasswordGates(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], password: value };
      updateParent(updated);
      return updated;
    });
  }, [updateParent]);

  // Handle enabled toggle
  const handleEnabledChange = useCallback((index, enabled) => {
    setPasswordGates(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], enabled };
      updateParent(updated);
      return updated;
    });
  }, [updateParent]);

  // Toggle password visibility
  const togglePasswordVisibility = useCallback((index) => {
    setPasswordGates(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], showPassword: !updated[index].showPassword };
      return updated;
    });
  }, []);

  // Add new password gate
  const addPasswordGate = useCallback(() => {
    setPasswordGates(prev => [...prev, { password: '', enabled: true, showPassword: false }]);
  }, []);

  // Remove password gate
  const removePasswordGate = useCallback((index) => {
    setPasswordGates(prev => {
      if (prev.length <= 1) return prev; // Keep at least one
      const updated = prev.filter((_, i) => i !== index);
      updateParent(updated);
      return updated;
    });
  }, [updateParent]);

  // Check if configuration is valid
  const isValid = useMemo(() => {
    if (!gated) return true;
    return passwordGates.some(g => g.password.trim().length > 0 && g.enabled);
  }, [gated, passwordGates]);

  // Count of configured gates
  const configuredCount = useMemo(() => {
    return passwordGates.filter(g => g.password.trim().length > 0 && g.enabled).length;
  }, [passwordGates]);

  return (
    <div className="space-y-4">
      {/* Gating Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <Label htmlFor="gating-toggle" className="text-sm font-medium">
            {t('participationRequirements') || 'Participation Requirements'}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          {gated && configuredCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {configuredCount} {configuredCount === 1 ? 'gate' : 'gates'}
            </Badge>
          )}
          <Switch
            id="gating-toggle"
            checked={gated}
            onCheckedChange={onGatedChange}
          />
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground">
        {gated
          ? t('gatingEnabledDesc') || 'Users must enter the password(s) before they can buy tickets.'
          : t('gatingDisabledDesc') || 'Anyone can participate in this season without restrictions.'}
      </p>

      {/* Password Gates Configuration */}
      {gated && (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {t('passwordGates') || 'Password Gates'}
            </Label>
            <Badge variant={isValid ? 'default' : 'destructive'} className="text-xs">
              {isValid ? 'Valid' : 'Invalid'}
            </Badge>
          </div>

          {/* Password Gate List */}
          <div className="space-y-2">
            {passwordGates.map((gate, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input
                    type={gate.showPassword ? 'text' : 'password'}
                    placeholder={`${t('password') || 'Password'} ${index + 1}`}
                    value={gate.password}
                    onChange={(e) => handlePasswordChange(index, e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => togglePasswordVisibility(index)}
                  >
                    {gate.showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>

                <Switch
                  checked={gate.enabled}
                  onCheckedChange={(checked) => handleEnabledChange(index, checked)}
                  title={gate.enabled ? 'Enabled' : 'Disabled'}
                />

                {passwordGates.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePasswordGate(index)}
                    className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Add Gate Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPasswordGate}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('addPasswordGate') || 'Add Another Password'}
          </Button>

          {/* Help Text */}
          <p className="text-xs text-muted-foreground">
            {t('gatingHelpText') || 'Users must enter ALL enabled passwords to participate (AND logic). Leave password empty to skip that gate.'}
          </p>

          {/* Validation Warning */}
          {gated && !isValid && (
            <p className="text-xs text-destructive">
              {t('gatingValidationError') || 'At least one password gate must be configured and enabled.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

GatingConfig.propTypes = {
  gated: PropTypes.bool.isRequired,
  onGatedChange: PropTypes.func.isRequired,
  onGatesChange: PropTypes.func,
};

export default GatingConfig;

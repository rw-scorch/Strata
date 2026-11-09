export class InputState {
  moveX = 0;
  moveZ = 0;
  sprint = false;
  jump = false;
  crouch = false;
  crouchToggle = false;
  lookDX = 0;
  lookDY = 0;
  breaking = false;
  using = false;
  usePressed = false;
  forcePlace = false;
  attackPressed = false;
  pick = false;
  drop = false;
  dropAll = false;
  hotbarDelta = 0;
  hotbarSelect: number | null = null;
  flyToggle = false;
  jumpPressed = false;
  touchAim: { x: number; y: number } | null = null;
  touchMode = false;
  lastJumpTap = 0;

  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookDX, this.lookDY];
    this.lookDX = 0; this.lookDY = 0;
    return r;
  }

  endFrame(): void {
    this.usePressed = false;
    this.attackPressed = false;
    this.pick = false;
    this.drop = false;
    this.dropAll = false;
    this.hotbarDelta = 0;
    this.hotbarSelect = null;
    this.flyToggle = false;
    this.jumpPressed = false;
  }

  reset(): void {
    this.moveX = this.moveZ = 0;
    this.sprint = this.jump = this.crouch = this.breaking = this.using = false;
    this.touchAim = null;
    this.endFrame();
  }
}

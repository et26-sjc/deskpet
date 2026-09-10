# Friend DeskPet Desktop Runtime

This runtime layer turns generated human companion sprites into a desktop pet.

## Design goals

- No prank behavior
- No forced interaction
- No harassment mechanics
- Simple companionship

## Components

- `window-manager.js`
  - transparent desktop window abstraction
  - show/hide/pause/resume

- `sprite-loader.js`
  - loads user generated transparent PNG assets

- `animator.js`
  - maps companion states to sprites

- `movement.js`
  - gentle autonomous movement

## Planned actions

```
idle
walk_left
walk_right
wave
sleep
smile
```

Generated realistic human assets should be placed under:

```
assets/character/
```

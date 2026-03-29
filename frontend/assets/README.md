# Codex Office - Asset Override

Drop PNG sprite sheets here to replace the programmatic sprites.

## Expected Files

### Character Sprites
- `char_green.png` - Agent color 1 (Codex green)
- `char_blue.png` - Agent color 2
- `char_amber.png` - Agent color 3
- etc.

**Format**: Horizontal strip, 6 frames, each frame 60x84 pixels (20x28 @ 3x scale)
- Frame 0: Idle 1
- Frame 1: Idle 2 (slight bob)
- Frame 2: Walk 1 (left foot forward)
- Frame 3: Walk 2 (passing)
- Frame 4: Walk 3 (right foot forward)
- Frame 5: Working (seated/typing)

### Boss
- `boss.png` - Boss character, 6 frames, each 72x96 pixels (24x32 @ 3x)

### Cat Mascot
- `cat.png` - Cat mascot, 4 frames, each 42x42 pixels (14x14 @ 3x)

### Office Background (optional)
- `office_bg.png` - 1280x720 full background image

## Generating with ComfyUI

Use a pixel art generation workflow with these specs:
- Style: 16-bit pixel art, chibi proportions
- Character size: 20x28 pixels (rendered at 3x = 60x84)
- Animation: 6 frames horizontal strip
- Background: transparent PNG
- Palette: limited colors, consistent across all characters

## Fork U-Bubble Simple Tabs

Tabbed card for Home Assistant dashboards with a visual editor, custom styling CSS, haptic feedback and URL deep-linking.

- **Visual editor**: Add tabs with "+", choose card type, edit in a list view with "Back to tabs list".
- **Styling CSS**: Custom CSS field in the editor (no card_mod required).
- **Haptic feedback**: Optional light vibration on tab change (iOS and Android).
- **URL support**: Open a specific tab via `#tab-id` in the hash or `?tab=tab-id` in the URL.
- **Swipe navigation**: Swipe left/right between tabs on touch devices.

### Requirements

- Home Assistant 2023.x or newer (Lovelace).

### Installation (HACS)

1. Add this repository in HACS: **Custom repositories** → Repository: `https://github.com/silasmariusz/home-assistant-simple-tabs` → Category: **Frontend**.
2. Install **Fork U-Bubble Simple Tabs** from the Frontend list.
3. Add the resource to your dashboard (or use **Add card** → **Fork U-Bubble Simple Tabs**).

### Configuration

- **type**: `custom:fork-u-bubble-simple-tabs`
- **tabs**: List of tab objects (title, icon, id, card or cards).
- **styling_css**: Optional CSS string applied to the card container.
- **haptic_feedback**: `true` to enable vibration on tab change.
- **enable_swipe**: Enable swipe between tabs (default: true).

See the README for full options and examples.

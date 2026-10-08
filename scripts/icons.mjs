import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const svg = await readFile('public/kite.svg');
await sharp(svg).resize(1024).flatten({ background: '#252b28' }).png().toFile('public/icon.png');
await sharp(svg).resize(192).png().toFile('public/icon-192.png');
await sharp(svg).resize(512).png().toFile('public/icon-512.png');
await sharp(svg).resize(180).png().toFile('public/apple-touch-icon.png');
await sharp(svg)
  .resize(1024)
  .flatten({ background: '#252b28' })
  .png()
  .toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
for (const [density, size] of Object.entries({
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
})) {
  const dir = `android/app/src/main/res/mipmap-${density}`;
  await mkdir(dir, { recursive: true });
  for (const file of ['ic_launcher', 'ic_launcher_round'])
    await sharp(svg).resize(size).png().toFile(`${dir}/${file}.png`);
  await sharp(svg)
    .resize(size * 2)
    .png()
    .toFile(`${dir}/ic_launcher_foreground.png`);
}
// Adaptive icons use an inset symbol so Android's circular masks keep the full kite.
const foreground =
  '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="128" android:viewportHeight="128"><group android:scaleX="0.62" android:scaleY="0.62" android:translateX="24" android:translateY="24"><path android:fillColor="#f6faf4" android:pathData="M29,38 L91,25 L78,87 L58,60 Z"/><path android:strokeColor="#b9d1b3" android:strokeWidth="3.5" android:strokeLineCap="round" android:pathData="M30,96 L58,60 L91,25 M29,38 L78,87"/></group></vector>';
await writeFile('android/app/src/main/res/drawable/ic_launcher_foreground.xml', foreground);
for (const file of ['ic_launcher', 'ic_launcher_round'])
  await writeFile(
    `android/app/src/main/res/mipmap-anydpi-v26/${file}.xml`,
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@drawable/ic_launcher_foreground"/></adaptive-icon>',
  );
await writeFile(
  'android/app/src/main/res/values/ic_launcher_background.xml',
  '<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#252b28</color></resources>',
);

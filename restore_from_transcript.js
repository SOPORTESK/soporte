const fs = require('fs');

const transcript = fs.readFileSync('C:/Users/Taller SK/.gemini/antigravity/brain/3f1bf8b7-994e-4e79-8f7e-2f71e3850d53/.system_generated/logs/transcript_full.jsonl', 'utf-8').split('\n');
let whatsappContent = fs.readFileSync('supabase/functions/seka-whatsapp/index.ts', 'utf-8');
let widgetContent = fs.readFileSync('supabase/functions/seka-widget/index.ts', 'utf-8');

transcript.forEach(line => {
  if (!line) return;
  try {
    const d = JSON.parse(line);
    if (d.tool_calls) {
      d.tool_calls.forEach(t => {
        if (t.name === 'replace_file_content') {
          const { TargetFile, TargetContent, ReplacementContent, AllowMultiple } = t.args;
          if (TargetFile && TargetFile.includes('seka-whatsapp') && TargetContent) {
            whatsappContent = whatsappContent.replace(TargetContent, ReplacementContent);
          }
          if (TargetFile && TargetFile.includes('seka-widget') && TargetContent) {
            widgetContent = widgetContent.replace(TargetContent, ReplacementContent);
          }
        }
      });
    }
  } catch (e) {}
});

fs.writeFileSync('supabase/functions/seka-whatsapp/index.ts', whatsappContent);
fs.writeFileSync('supabase/functions/seka-widget/index.ts', widgetContent);
console.log('Restoration complete!');

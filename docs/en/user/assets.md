# Assets (File Exchange)

Assets are the bridge for exchanging files between you and the AI. Upload files for analysis, and the AI can generate files (charts, reports) for you to download.

## Uploading Files

Click the **📎 paperclip button** on the left side of the chat input to select local files. Uploaded files appear as cards above the input box. Click ✕ to remove a pending file.

All common file types are supported: CSV, JSON, Excel, images (PNG, JPG, SVG, WebP), Markdown, PDF, source code, and more.

After sending, the AI reads your file automatically:

```
📎 Upload sales-data.csv

Analyze this data and give me a monthly trend summary
```

```
📎 Upload screenshot.png

What's wrong with this UI? Suggest improvements.
```

## AI-Generated Files

The AI may generate files during tasks — analysis reports (CSV/Excel), charts (PNG), or processed exports. These appear as cards in the AI's reply. Click the download button to save them.

### Image Preview

Images (uploaded or generated) show inline thumbnails. Click a thumbnail to view the full-size image. Press **Esc** or click the backdrop to close.

## Storage & Privacy

- All files are stored in your browser's local sandbox (OPFS). **Nothing is uploaded to cloud servers.**
- Files are scoped to the current workspace and persist across browser sessions.
- Your project directory is never modified by assets.
- File contents are read by the AI locally — only filenames and sizes are included in API metadata.

## Using Assets in Python

When the AI runs Python code, the assets directory is mounted at `/mnt_assets/`.

**Read an uploaded file:**

```python
import pandas as pd
df = pd.read_csv('/mnt_assets/sales-data.csv')
```

**Write a file for the user:**

```python
df.describe().to_csv('/mnt_assets/analysis_result.csv')
```

**Generate a chart:**

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.figure()
plt.plot(df['month'], df['revenue'])
plt.savefig('/mnt_assets/trend.png')
plt.close()
```

Files written to `/mnt_assets/` automatically appear in the chat for preview and download.

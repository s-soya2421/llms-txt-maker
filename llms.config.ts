import { defineConfig } from '@soya/llms-txt';

export default defineConfig({
  site: {
    title: 'Soya Tech',
    url: 'https://s-soya.tech'
  },
  sources: {
    manual: {
      items: [
        {
          title: 'Soya Tech Overview',
          url: 'https://s-soya.tech',
          summary: '公式サイトのトップページ',
          tags: ['doc']
        }
      ]
    },
    sitemap: {
      maxSummaryChars: 200
    }
  },
  renderOptions: {
    includeTimestamp: true,
    redactPII: false
  }
});

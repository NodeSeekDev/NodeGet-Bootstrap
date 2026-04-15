# nodeget static worker

此worker在nodeget-server被安装时辅助安装，用于提高用户体验
具体功能为：提供静态文件上传/下载接口，是扩展管理功能的必要依赖
注意：不要删除或者修改此worker的代码，否则可能会引发错误

## 环境变量
- disable_auto_update: 是否关闭自身的自动升级

## http路由接口

```js
const resourceURL = 'https://SERVER_WS_HOST/worker-route/static-worker-route/{Resource_Group_Name}/hello';

// 储存静态资源
fetch(resourceURL,{
    method:'POST',
    body:'你好世界',
    headers:{
        // Bearer + nodeget token
        'Authorization':'Bearer {Token}'
    }
}).then(r => r.text()).then(console.log)

Token为superToken

// 获取静态资源(无需Token)
fetch(resourceURL).then(r => r.text()).then(console.log)
```

## rpc call接口
无
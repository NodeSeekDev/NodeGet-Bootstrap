# nodeget ip location worker

本worker用于每个agent节点ip位置的定时更新

注意：不要删除或者修改此worker的代码，否则可能会引发错误

## 环境变量

## http路由接口
无

## rpc call接口

params如下，提交需要更新ip地址信息的agent uuid列表
不提供参数默认更新所有agent的ip位置信息
```json
{
    "uuids":[]
}
```
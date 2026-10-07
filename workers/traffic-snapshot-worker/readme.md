# nodeget traffic snapshot worker

本worker用于定时保存各设备出口网卡的总流量快照，并清理过期的快照。

NodeGet 的流量统计靠快照算出某个时间段用了多少流量：结束时刻的快照减去开始时刻的快照。服务端自己只维护每块网卡的总流量，不生成快照，快照由本worker通过服务端的接口写入。**没有安装并运行本worker，就查不到任何时间段的流量。**

本worker会随 Bootstrap 自动升级，对代码的修改会在升级时被覆盖。如需自定义，请先把环境变量 `disable_auto_update` 设为 `"true"` 关闭自动升级。

## 工作方式

- `traffic-snapshot-tick`：每分钟执行一次，调用 `agent_query_traffic_current` 取出所有设备当前的总流量，判断每块网卡是否该存快照，把该存的通过 `agent_write_traffic_snapshot` 写入
- `traffic-snapshot-cleanup`：每小时的第 30 分钟执行一次，调用 `agent_delete_traffic_snapshot` 删除超过保留时长的快照，同时清理整段早于该时间的"可能丢失数据"记录

每块网卡是否存快照，按下面的规则依次判断：

1. 还没有快照：存
2. 最后一条快照已经在当前的快照时间段内：不存，每个时间段（默认 15 分钟，UTC 整点对齐）最多存一条
3. 上次存快照之后没有收到过这块网卡的新上报：不存，总流量没变，存了也和上一条一样。设备离线、网卡消失后不会一直重复写
4. 其余情况：存

快照的时间是执行时刻向下取整到分钟。正常情况每分钟第 0 秒执行，和时间段的整点只差几秒；刚安装或者 worker 停了一阵之后，则如实标成真实时间，查询时开始时间早于第一条快照会提示找不到起点快照，而不是悄悄少算流量。

Worker 停了很久之后，只会补存当前这一条，不补中间缺的。

## 配置

都放在 Kv 的 `global` 命名空间里，没有配置时使用默认值。不合法的配置会回退到默认值，并在 Server 日志里记一条警告。

| 键 | 含义 | 默认值 |
|---|---|---|
| `traffic_snapshot_interval` | 快照间隔，毫秒。必须是 60000 的整数倍，至少 60000（1 分钟） | 900000（15 分钟） |
| `database_limit_traffic_snapshot` | 快照保留时长，毫秒，至少 3600000（1 小时） | 31536000000（365 天） |

快照间隔建议选能整除一天的值（如 5、10、15、20、30、60 分钟）。不能整除一天的值（如 17 分钟）也能用，只是每天的整点时刻会漂移。

## 环境变量
- disable_auto_update: 是否关闭自身的自动升级
- token: 默认为：superToken

## http路由接口
无

## rpc call接口

手动触发一次存快照（判断规则同定时任务）

请求
```json
{
  "task":{
    "name":"snapshot"
  }
}
```

返回
```json
{
  "ok": true,
  "interval": 900000,
  "stats": {
    "interfaces": 4,
    "written": 2,
    "skipped_same_period": 1,
    "skipped_unchanged": 1
  },
  "inserted": 2,
  "ignored": 0,
  "skipped": 0
}
```

手动触发一次清理

请求
```json
{
  "task":{
    "name":"cleanup"
  }
}
```

返回
```json
{
  "ok": true,
  "retention": 31536000000,
  "end_time": 1760000000000,
  "deleted_snapshots": 0,
  "deleted_possible_data_losses": 0
}
```

## 依赖

需要服务端提供 `agent_query_traffic_current`、`agent_write_traffic_snapshot`、`agent_delete_traffic_snapshot` 三个接口。服务端版本太旧、没有这些接口时，本worker只会记一条警告并跳过，不会报错刷屏。

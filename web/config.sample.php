<?php
/* config.sample.php — 配置样例。正式环境请通过 install.php 生成 config.php，无需手动改名。 */
return array(
    'db' => array(
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'store_staff',
        'user' => 'db_user',
        'pass' => 'db_password',
        'charset' => 'utf8mb4'
    ),
    'app' => array(
        'timezone' => 'Asia/Shanghai',
        'session_name' => 'TSSTAFFSID',
        'upload_max_mb' => 20
    )
);

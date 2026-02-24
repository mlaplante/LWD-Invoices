drop table if exists `{DBPREFIX}action_logs`, `{DBPREFIX}migrations`;

-- split --

create table `{DBPREFIX}action_logs` (
  `id`        int(11)      not null auto_increment primary key,
  `timestamp` int(11)      not null,
  `user_id`   int(11)      not null,
  `action`    varchar(255) not null,
  `message`   text         not null,
  `item_id`   int(11)      not null
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}clients`;

-- split --

create table `{DBPREFIX}clients` (
  `id`                         int(11) unsigned                      not null auto_increment,
  `first_name`                 varchar(64)                                    default '',
  `last_name`                  varchar(64)                                    default '',
  `title`                      varchar(64)                                    default '',
  `email`                      varchar(1024)                                  default '',
  `company`                    varchar(128)                                   default '',
  `address`                    text,
  `phone`                      varchar(64)                                    default '',
  `fax`                        varchar(64)                                    default '',
  `mobile`                     varchar(64)                                    default '',
  `website`                    varchar(128)                                   default '',
  `language`                   varchar(255)                                   default '',
  `business_identity`          int(255),
  `can_create_support_tickets` tinyint(1)                            not null default '0',
  `profile`                    text,
  `unique_id`                  varchar(32)
                               character set utf8
                               collate utf8_bin                   not null,
  `passphrase`                 varchar(32)                                    default '',
  `created`                    datetime                              not null,
  `support_user_id`            int(10)                               not null default '0',
  `modified`                   timestamp on update current_timestamp not null default CURRENT_TIMESTAMP,
  `owner_id`                   int(255) unsigned                     not null default '0',
  `default_currency_code`      varchar(3)                                     default null,
  `has_custom_tax_ids`         tinyint(1)                            not null default '0',
  `can_view_invoices_without_passphrase` tinyint(1) not null default '0',
  `forgotten_password_code`              varchar(40) default null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}client_ticket_support_rate_matrix` (
  `id`          int(10) unsigned not null auto_increment,
  `client_id`   int(10)          not null,
  `priority_id` int(10)          not null,
  `rate`        float(10, 2)     not null,
  `tax_id`      int(255)         not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}contact_log`;

-- split --

create table if not exists `{DBPREFIX}contact_log` (
  `id`        int unsigned            not null auto_increment,
  `client_id` int unsigned            not null,
  `user_id`   int unsigned            not null,
  `method`    enum ('phone', 'email') not null,
  `contact`   varchar(255)            not null,
  `subject`   varchar(998)            not null,
  `content`   text,
  `sent_date` int(10) unsigned        not null,
  `duration`  int(11)                 not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}project_timers`;

-- split --

create table `{DBPREFIX}project_timers` (
  `id`                      int(10) unsigned  not null auto_increment,
  `start_timestamp`         int(255)          not null,
  `last_modified_timestamp` int(255)          not null,
  `current_seconds`         int(255)          not null,
  `task_id`                 int(255) unsigned not null,
  `user_id`                 int(255)          not null default '0',
  `pauses_json`             longtext          null,
  `is_paused`               tinyint(1)        not null default '0',
  `is_over`                 tinyint(1)        not null default '0',
  primary key (`id`),
  index task_id (`task_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}project_templates`;

-- split --

create table `{DBPREFIX}project_templates` (
  `id`                    int(11)        not null auto_increment,
  `client_id`             varchar(10)    null     default null,
  `name`                  varchar(255)   not null,
  `description`           text           null     default null,
  `rate`                  decimal(10, 2) null     default null,
  `currency_id`           int(11)        null     default null,
  `exchange_rate`         float(10, 5)   not null,
  `is_viewable`           tinyint(1)     not null,
  `is_timesheet_viewable` tinyint(1)     not null default '0',
  `projected_hours`       float          not null default '0',
  `is_flat_rate`          tinyint(1)     not null default '0',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}notifications`;

-- split --

create table `{DBPREFIX}notifications` (
  `id`         int(11)      not null auto_increment,
  `context`    varchar(255) not null,
  `context_id` int(11)      not null,
  `message`    text         not null,
  `seen`       tinyint(1)   not null default '0',
  `created`    int(11)      not null,

  `action`     varchar(255) null,
  `user_id`    int(255)     null,
  `client_id`  int(255)     null,

  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}project_task_templates`;

-- split --

create table `{DBPREFIX}project_task_templates` (
  `id`                    int(11)          not null auto_increment,
  `project_id`            int(11)          not null,
  `parent_id`             int(11)          null     default null,
  `assigned_user_id`      int(11)          null     default null,
  `name`                  varchar(255)     not null,
  `rate`                  decimal(10, 2)   null     default null,
  `hours`                 decimal(10, 2)   null     default null,
  `notes`                 text             null     default null,
  `milestone_id`          int(10)          not null default '0',
  `is_viewable`           tinyint(1)       not null default '0',
  `is_timesheet_viewable` tinyint(1)                default null,
  `order`                 int(11) unsigned not null default '0',
  `projected_hours`       float            not null default '0',
  `status_id`             int(255)                  default '0',
  `is_flat_rate`          tinyint(1)       not null default '0',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}currencies`;

-- split --

create table `{DBPREFIX}currencies` (
  `id`     int(5) unsigned not null auto_increment,
  `name`   varchar(200)             default '',
  `code`   varchar(3)      not null,
  `rate`   float                    default '0',
  `format` varchar(190)    not null default '{"symbol":"before","decimal":".","thousand":",","decimals":2}',
  primary key (`id`),
  key `code` (`code`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}files`;

-- split --

create table `{DBPREFIX}files` (
  `id`                int(11)             not null auto_increment,
  `invoice_unique_id` varchar(32)
                      character set utf8
                      collate utf8_bin not null,
  `orig_filename`     varchar(255)        not null,
  `real_filename`     text                not null,
  `download_count`    int(5)                       default '0',
  primary key (`id`),
  key `invoice_unique_id` (`invoice_unique_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}gateway_fields`;

-- split --

create table `{DBPREFIX}gateway_fields` (
  `gateway`              varchar(190) not null,
  `field`                varchar(190) not null,
  `value`                text         not null,
  `type`                 enum ('CLIENT', 'INVOICE', 'ENABLED', 'FIELD', 'RECURRING_TOKEN') default null,
  `business_identity_id` int(11) unsigned                                                  default null,
  key `gateway` (`gateway`),
  key `field` (`field`),
  key `gateway_fields_index_business_identity_id_type` (`business_identity_id`, `type`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}groups`;

-- split --

create table `{DBPREFIX}groups` (
  `id`          mediumint(8) unsigned not null auto_increment,
  `name`        varchar(20)           not null,
  `description` varchar(100)          not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}items`;

-- split --

create table `{DBPREFIX}items` (
  `id`          int(11)      not null auto_increment,
  `name`        varchar(255) not null,
  `description` text         not null,
  `qty`         float        not null default '1',
  `rate`        float        not null default '0',
  `tax_id`      int(11)      not null,
  `type`        varchar(128),
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}keys`;

-- split --

create table `{DBPREFIX}keys` (
  `id`             int(11)     not null auto_increment,
  `key`            varchar(40) not null,
  `level`          int(2)      not null,
  `ignore_limits`  tinyint(1)  not null default '0',
  `is_private_key` tinyint(1)  not null default '0',
  `ip_addresses`   text        null     default null,
  `note`           text        null     default null,
  `date_created`   int(11)     not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}logs`;

-- split --

create table `{DBPREFIX}logs` (
  `id`         int(11)      not null auto_increment,
  `uri`        varchar(255) not null,
  `method`     varchar(6)   not null,
  `params`     text                  default null,
  `api_key`    varchar(40)  not null,
  `ip_address` varchar(45)  not null,
  `time`       int(11)      not null,
  `rtime`      float                 default null,
  `authorized` tinyint(1)   not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}taxes`;

-- split --

create table `{DBPREFIX}taxes` (
  `id`          int(5) unsigned not null auto_increment,
  `name`        varchar(200)             default '',
  `value`       float                    default '0',
  `reg`         varchar(100)             default '',
  `is_compound` tinyint(1)      not null default '0',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

insert into `{DBPREFIX}taxes` (name, value) values ('Default', '{TAX_RATE}');

-- split --

drop table if exists `{DBPREFIX}hidden_notifications`;

-- split --

create table `{DBPREFIX}hidden_notifications` (
  `user_id`         int(11)      not null,
  `notification_id` varchar(150) not null,
  index (`user_id`, `notification_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}assignments`;

-- split --

create table `{DBPREFIX}assignments` (
  `user_id`                   int(11)      not null,
  `item_id`                   int(11)      not null,
  `item_type`                 varchar(150) not null default '',
  `can_read`                  tinyint(1)   not null,
  `can_update`                tinyint(1)   not null,
  `can_delete`                tinyint(1)   not null,
  `can_generate_from_project` tinyint(1)   not null,
  `can_send`                  tinyint(1)   not null,
  key `user_id` (`user_id`),
  key `item_id` (`item_id`),
  key `item_type` (`item_type`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}invoice_rows`;

-- split --

create table `{DBPREFIX}invoice_rows` (
  `id`                     int(11)             not null auto_increment,
  `unique_id`              varchar(32)
                           character set utf8
                           collate utf8_bin not null,
  `name`                   varchar(255)                 default '',
  `description`            text,
  `qty`                    float                        default '0',
  `tax_id`                 int(5)                       default '0',
  `rate`                   varchar(255)                 default '',
  `period`                 decimal(10, 2)               default null,
  `total`                  varchar(255)                 default '',
  `sort`                   smallint(4)         not null default '0',
  `type`                   varchar(128),
  `item_type_id`           int(255)            not null default '0',
  `discount`               decimal(65, 10)     not null default '0.0000000000',
  `discount_is_percentage` tinyint(1)          not null default '0',
  `item_type_table`        varchar(255)        not null default '',
  primary key (`id`),
  index unique_id (`unique_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table `{DBPREFIX}invoice_rows_taxes` (
  `id`             int(11) unsigned not null auto_increment,
  `tax_id`         int(11) unsigned not null default 0,
  `invoice_row_id` int(11) unsigned not null default 0,
  primary key (`id`),
  key `tax_id` (`tax_id`),
  key `invoice_row_id` (`invoice_row_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}items_taxes` (
  `id`      int(11) unsigned not null auto_increment,
  `tax_id`  int(11) unsigned not null default 0,
  `item_id` int(11) unsigned not null default 0,
  primary key (`id`),
  key `tax_id` (`tax_id`),
  key `item_id` (`item_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}meta`;

-- split --

create table `{DBPREFIX}meta` (
  `id`                   mediumint(8) unsigned not null auto_increment,
  `user_id`              mediumint(8) unsigned not null,
  `first_name`           varchar(50)                    default '',
  `last_name`            varchar(50)                    default '',
  `company`              varchar(100)                   default '',
  `phone`                varchar(20)                    default '',
  `custom_background`    varchar(255),
  `last_visited_version` varchar(48)                    default '',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}notes`;

-- split --

create table `{DBPREFIX}notes` (
  `id`        int(11)   not null auto_increment,
  `client_id` int(11)   not null,
  `note`      text      not null,
  `submitted` timestamp not null default CURRENT_TIMESTAMP,
  primary key (`id`),
  key `client_id` (`client_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}invoices`;

-- split --

create table `{DBPREFIX}invoices` (
  `id`                    int(11)           not null                               auto_increment,
  `unique_id`             varchar(32)
                          character set utf8
                          collate utf8_bin  not null,
  `client_id`             int(11)                                                  default '0',
  `amount`                decimal(20, 10)   null                                   default '0',
  `due_date`              int(11)                                                  default '0',
  `invoice_number`        varchar(255)                                             default '',
  `notes`                 text,
  `description`           text,
  `txn_id`                varchar(255)                                             default '',
  `payment_gross`         float                                                    default '0',
  `item_name`             varchar(255)                                             default '',
  `payment_hash`          varchar(32)                                              default '',
  `payment_status`        varchar(255)                                             default '',
  `payment_type`          varchar(255)                                             default '',
  `payment_date`          int(11)                                                  default '0',
  `payer_status`          varchar(255)                                             default '',
  `type`                  enum ('SIMPLE', 'DETAILED', 'ESTIMATE', 'CREDIT_NOTE')   default 'DETAILED',
  `date_entered`          int(11)                                                  default '0',
  `is_paid`               tinyint(1)                                               default '0',
  `is_recurring`          tinyint(1)                                               default '0',
  `frequency`             varchar(2),
  `auto_send`             tinyint(1)        not null                               default '0',
  `recur_id`              int(11)           not null                               default '0',
  `currency_id`           int(11)           not null                               default '0',
  `exchange_rate`         float(10, 5)      not null                               default '1.00000',
  `proposal_id`           int(20)           not null                               default '0',
  `send_x_days_before`    int(11)           not null                               default '7',
  `has_sent_notification` int(1)            not null                               default '0',
  `last_sent`             int(11)           not null                               default '0',
  `next_recur_date`       int(11)           not null                               default '0',
  `last_viewed`           int(20)           not null                               default '0',
  `is_viewable`           tinyint(1)        not null                               default '0',
  `is_archived`           tinyint(1)        not null                               default '0',
  `owner_id`              int(255) unsigned not null                               default '0',
  `last_status_change`    int(255)          not null                               default '0',
  `status`                varchar(255)      not null                               default '',
  `project_id`            int(255)          not null                               default '0',
  `auto_charge`           tinyint(1)        not null                               default '0',
  primary key (`id`),
  index unique_id (`unique_id`),
  key `invoices_index_type_is_archived_client_id` (`type`, `is_archived`, `client_id`),
  key `invoices_index_client_id` (`client_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}partial_payments`;

-- split --

create table `{DBPREFIX}partial_payments` (
  `id`                int(11)             not null auto_increment,
  `unique_invoice_id` varchar(10)         not null,
  `amount`            float               not null,
  `gateway_surcharge` float               not null,
  `is_percentage`     tinyint(1)          not null,
  `due_date`          int(11)             not null,
  `notes`             text                not null,
  `txn_id`            varchar(255)        not null default '',
  `payment_gross`     float               not null,
  `item_name`         varchar(255)        not null,
  `is_paid`           tinyint(1)          not null,
  `payment_date`      int(11)             not null,
  `payment_type`      varchar(255)        not null,
  `payer_status`      varchar(255)        not null,
  `payment_status`    varchar(255)        not null,
  `unique_id`         varchar(32)
                      character set utf8
                      collate utf8_bin not null,
  `payment_method`    varchar(255)        not null,
  `key`               int(11)             not null,
  `improved`          int(11)             not null default 1,
  `transaction_fee`   float               not null,
  primary key (`id`),
  key `unique_invoice_id` (`unique_invoice_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}permissions`;

-- split --

create table `{DBPREFIX}permissions` (
  `id`       int(11)     not null auto_increment,
  `group_id` int(11)     not null,
  `module`   varchar(50) not null,
  `roles`    text,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}projects`;

-- split --

create table `{DBPREFIX}projects` (
  `id`                    int(10) unsigned                      not null auto_increment,
  `client_id`             int(11)                               not null,
  `name`                  varchar(255)                          not null,
  `due_date`              int(11)                               not null,
  `description`           text                                  not null,
  `date_entered`          int(11)                               not null,
  `date_updated`          timestamp on update current_timestamp null     default null,
  `rate`                  decimal(10, 2)                        not null default '0.00',
  `completed`             tinyint(4)                            not null,
  `currency_id`           int(11)                               not null,
  `exchange_rate`         float(10, 5)                          not null default '1.00000',
  `unique_id`             varchar(32)
                          character set utf8
                          collate utf8_bin                   not null,
  `is_viewable`           tinyint(1)                            not null,
  `is_timesheet_viewable` tinyint(1)                            not null default '0',
  `projected_hours`       float                                 not null default '0',
  `is_archived`           tinyint(1)                            not null default 0,
  `owner_id`              int(255) unsigned                     not null default '0',
  `is_flat_rate`          tinyint(1)                            not null default '0',
  primary key (`id`),
  key `client_id` (`client_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}project_expenses`;

-- split --

create table `{DBPREFIX}project_expenses` (
  `id`                int(10) unsigned  not null auto_increment,
  `project_id`        int(10) unsigned  not null,
  `payment_source_id` int(11)                    default null,
  `invoice_id`        int(11)                    default null,
  `invoice_number`    varchar(255)               default null,
  `due_date`          datetime                   default null,
  `name`              varchar(255)      not null default '',
  `description`       text,
  `qty`               int(10) unsigned  not null default '1',
  `rate`              decimal(8, 2)     not null,
  `tax_id`            int(10)           not null default '0',
  `supplier_id`       int(11)           not null default '0',
  `category_id`       int(11)           not null default '0',
  `payment_details`   text              not null,
  `owner_id`          int(255) unsigned not null default '0',
  `invoice_item_id`   int(11)           not null default '0',
  `receipt`           varchar(1024)     not null default '',
  primary key (`id`),
  key `project_id` (`project_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}assignments_permissions`;

-- split --

create table `{DBPREFIX}assignments_permissions` (
  `id`                        int(10) unsigned not null auto_increment,
  `user_id`                   int(255)         not null,
  `client_id`                 int(255)         not null,
  `item_type`                 varchar(255)     not null default '',
  `item_id`                   int(255)         not null,
  `can_all`                   tinyint(1)       not null,
  `can_create`                tinyint(1)       not null,
  `can_read`                  tinyint(1)       not null,
  `can_update`                tinyint(1)       not null,
  `can_delete`                tinyint(1)       not null,
  `can_generate_from_project` tinyint(1)       not null,
  `can_send`                  tinyint(1)       not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}project_expenses_categories`;

-- split --

create table `{DBPREFIX}project_expenses_categories` (
  `id`          int(10) unsigned not null auto_increment,
  `parent_id`   int(10) unsigned null,
  `name`        varchar(255)     not null default '',
  `description` text,
  `notes`       text,
  `deleted`     tinyint(1)       not null default '0',
  `status`      varchar(128)     null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}project_expenses_suppliers`;

-- split --

create table `{DBPREFIX}project_expenses_suppliers` (
  `id`          int(10) unsigned not null auto_increment,
  `name`        varchar(255)     not null default '',
  `description` text,
  `notes`       text,
  `deleted`     tinyint(1)       not null default '0',
  `status`      varchar(128)     null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}project_tasks`;

-- split --

create table `{DBPREFIX}project_tasks` (
  `id`                    int(10) unsigned                      not null auto_increment,
  `project_id`            int(10) unsigned                      not null,
  `milestone_id`          int(11)                               not null default '0',
  `parent_id`             int(10)                               not null default '0',
  `name`                  varchar(1024)                         not null,
  `rate`                  decimal(10, 2)                        not null default '0.00',
  `hours`                 decimal(10, 2)                        not null default '0.0',
  `notes`                 text                                  not null,
  `due_date`              int(11)                                        default '0',
  `completed`             tinyint(4)                            not null,
  `is_viewable`           tinyint(1)                            not null,
  `is_timesheet_viewable` tinyint(1)                                     default null,
  `projected_hours`       float                                 not null default '0',
  `status_id`             int(255)                                       default '0',
  `assigned_user_id`      int(10),
  `date_entered`          timestamp                             null     default null,
  `date_updated`          timestamp on update current_timestamp null     default null,
  `owner_id`              int(255) unsigned                     not null default '0',
  `order`                 int(11) unsigned                      not null default '0',
  `is_flat_rate`          tinyint(1)                            not null default '0',
  `invoice_item_id`       int(11)                               not null default '0',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}project_times`;

-- split --

create table `{DBPREFIX}project_times` (
  `id`              int(10) unsigned not null auto_increment,
  `project_id`      int(10) unsigned not null,
  `task_id`         int(10) unsigned          default null,
  `user_id`         int(10) unsigned          default null,
  `start_time`      varchar(5)       not null default '',
  `end_time`        varchar(5)       not null default '',
  `minutes`         decimal(16, 8)   not null,
  `date`            int(11)                   default null,
  `note`            text,
  `invoice_item_id` int(11)          not null default '0',
  `date_updated`    timestamp        not null default CURRENT_TIMESTAMP on update current_timestamp,
  primary key (`id`),
  key `project_id` (`project_id`),
  key `user_id` (`user_id`),
  key `date` (`date`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}project_milestones`;

-- split --

create table `{DBPREFIX}project_milestones` (
  `id`               int unsigned     not null auto_increment,
  `name`             varchar(255)     not null,
  `description`      text,
  `project_id`       int unsigned     not null,
  `assigned_user_id` int unsigned              default null,
  `color`            varchar(50)      not null,
  `target_date`      int unsigned              default null,
  `is_viewable`      tinyint(1)       not null,
  `order`            int(11) unsigned not null default '0',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}proposals`;

-- split --

create table `{DBPREFIX}proposals` (
  `id`                 int(11)             not null auto_increment,
  `unique_id`          varchar(32)
                       character set utf8
                       collate utf8_bin not null,
  `created`            int(11)             not null,
  `last_sent`          int(11)             not null default '0',
  `last_status_change` int(20)             not null default '0',
  `last_viewed`        int(20)             not null default '0',
  `invoice_id`         int(11)             not null,
  `project_id`         int(11)             not null,
  `client_id`          int(11)             not null,
  `title`              varchar(255)        not null,
  `status`             varchar(255)        not null,
  `proposal_number`    varchar(190)        not null default '',
  `client_company`     varchar(255)        not null default '',
  `client_address`     text,
  `client_name`        varchar(255)        not null default '',
  `is_viewable`        tinyint(1)          not null,
  `is_archived`        tinyint(1)          not null default '0',
  `owner_id`           int(255) unsigned   not null default '0',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}proposal_sections`;

-- split --

create table `{DBPREFIX}proposal_sections` (
  `id`           int(11)      not null auto_increment,
  `proposal_id`  int(11)      not null,
  `title`        varchar(255) not null,
  `subtitle`     varchar(255) not null,
  `contents`     text         not null,
  `key`          int(11)      not null,
  `parent_id`    int(11)      not null,
  `page_key`     int(11)      not null,
  `section_type` varchar(128) not null default '',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

drop table if exists `{DBPREFIX}settings`;

-- split --

create table `{DBPREFIX}settings` (
  `slug`  varchar(100) not null default '',
  `value` longtext,
  primary key (`slug`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

insert into `{DBPREFIX}settings` values
  ('admin_theme', 'pancake'),
  ('currency', '{CURRENCY}'),
  ('license_key', '{LICENSE_KEY}'),
  ('mailing_address', '{MAILING_ADDRESS}'),
  ('notify_email', '{NOTIFY_EMAIL}'),
  ('rss_password', '{RSS_PASSWORD}'),
  ('site_name', '{SITE_NAME}'),
  ('admin_name', '{FIRST_NAME} {LAST_NAME}'),
  ('theme', '{THEME}'),
  ('version', '{VERSION}'),
  ('latest_version_fetch', '0'),
  ('auto_update', '0'),
  ('is_just_installed', '1'),
  ('ftp_host', ''),
  ('ftp_user', ''),
  ('ftp_pass', ''),
  ('ftp_path', '/'),
  ('bcc', '0'),
  ('include_remittance_slip', '1'),
  ('always_https', '0'),
  ('remittance_slip', '<h2>How to Pay</h2>

View invoice online at:
{{invoice.url}}

You may pay in person, online, or by mail using this payment voucher. Please provide your payment information below.

Enclosed Amount: __________________________________'),
  ('use_utf8_font', '0'),
  ('default_tax_id', '0'),
  ('include_time_entry_dates', '0'),
  ('split_line_items_by', 'project_tasks'),
  ('accounting_type', 'accrual'),
  ('email_type', 'mail'),
  ('smtp_host', ''),
  ('smtp_user', ''),
  ('smtp_pass', ''),
  ('smtp_port', ''),
  ('smtp_encryption', ''),
  ('kitchen_route', 'client_area'),
  ('mailpath', '/usr/sbin/sendmail'),
  ('ftp_port', '21'),
  ('ftp_pasv', '1'),
  ('latest_version', '0'),
  ('date_format', 'm/d/Y'),
  ('time_format', 'H:i'),
  ('timezone', '{TIMEZONE}'),
  ('language', 'english'),
  ('task_time_interval', ''),
  ('frontend_css', ''),
  ('backend_css', ''),
  ('frontend_js', ''),
  ('backend_js', ''),
  ('items_per_page', '10'),
  ('send_x_days_before', '7'),
  ('enable_pdf_attachments', '1'),
  ('allowed_extensions', 'pdf,png,psd,jpg,jpeg,bmp,ai,txt,zip,rar,7z,gzip,bzip,gz,gif,doc,docx,ppt,pptx,xls,xlsx,csv,eps'),
  ('pdf_page_size', 'A4'),
  ('default_invoice_due_date', ''),
  ('default_task_due_date', '7'),
  ('send_multipart', '1'),
  ('autosave_proposals', '1'),
  ('always_autosend', '0'),
  ('year_start_day', '1'),
  ('year_start_month', '1'),
  ('store_auth_token', ''),
  ('store_auth_email', ''),
  ('never_use_ssl', '0'),
  ('hide_tax_column', '0'),
  ('tax_transaction_fees', '1'),
  ('ticket_status_for_sending_invoice', '0'),
  ('gmail_email', ''),
  ('gmail_access_token', ''),
  ('gmail_refresh_token', ''),
  ('gmail_expiry_timestamp', ''),
  ('filesystem', ''),
  ('last_cron_run_datetime', ''),
  ('logo_url', '');

-- split --

drop table if exists `{DBPREFIX}users`;

-- split --

create table `{DBPREFIX}store_purchases` (
  `id`                              int(11)      not null auto_increment,
  `plugin_unique_id`                varchar(255)          default null,
  `plugin_title`                    varchar(255) not null,
  `plugin_type_id`                  varchar(255)          default null,
  `filepath`                        text,
  `current_version`                 varchar(255)          default null,
  `latest_version`                  varchar(255)          default null,
  `date_added`                      timestamp    not null default CURRENT_TIMESTAMP,
  `changelog_since_current_version` longtext,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}users` (
  `id`                      mediumint(8) unsigned not null auto_increment,
  `group_id`                mediumint(8) unsigned not null,
  `ip_address`              varchar(45)           not null,
  `username`                varchar(200)          not null,
  `password`                varchar(40)           not null,
  `salt`                    varchar(40)                    default '',
  `email`                   varchar(40)           not null,
  `activation_code`         varchar(40)                    default '',
  `forgotten_password_code` varchar(40)                    default '',
  `remember_code`           varchar(40)                    default '',
  `created_on`              int(11) unsigned      not null,
  `last_login`              int(11) unsigned               default null,
  `active`                  tinyint(1) unsigned            default '1',
  `date_updated`            timestamp             not null default CURRENT_TIMESTAMP on update current_timestamp,
  `last_activity`           datetime                       default null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}project_files` (
  `id`            int(11) unsigned not null auto_increment,
  `comment_id`    int(11) unsigned not null,
  `created`       int(10) unsigned not null,
  `orig_filename` varchar(255)     not null,
  `real_filename` text             not null,
  primary key (`id`),
  index comment_id (`comment_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}project_task_statuses` (
  `id`               int(11)      not null auto_increment,
  `title`            varchar(255) not null,
  `background_color` varchar(50)  not null,
  `font_color`       varchar(50)  not null,
  `text_shadow`      varchar(255) not null,
  `box_shadow`       varchar(255) not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}comments` (
  `id`         int(11) unsigned not null auto_increment,
  `client_id`  int(11) unsigned not null,
  `user_id`    int(11) unsigned null,
  `user_name`  varchar(255)     not null,
  `created`    int(10) unsigned not null,
  `item_type`  varchar(190)     not null,
  `item_id`    int(11)          null,
  `comment`    text             not null,
  `is_private` tinyint(1)       not null default '0',
  primary key (`id`),
  index client_id (`client_id`),
  index user_id (`user_id`),
  index item_type (`item_type`),
  index item_id (`item_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}project_updates` (
  `id`         int(11) unsigned not null auto_increment,
  `project_id` int(11) unsigned not null,
  `name`       varchar(255)     not null,
  `created`    int(10) unsigned not null,
  primary key (`id`),
  index project_id (`project_id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}plugins` (
  `slug`    varchar(100) not null,
  `value`   text,
  `version` varchar(20),
  primary key (`slug`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

insert into `{DBPREFIX}meta` values (1, 1, '{FIRST_NAME}', '{LAST_NAME}', '{SITE_NAME}', '0', null, '{VERSION}');

-- split --

create table `{DBPREFIX}migrations` (
  `version` int(3) default null
)
  engine = InnoDB
  default charset = utf8;

-- split --

insert into `{DBPREFIX}migrations` values ('{MIGRATION}');

-- split --

insert into `{DBPREFIX}groups` values (1, 'admin', 'Administrator'), (2, 'members', 'General User');

-- split --

insert into `{DBPREFIX}project_task_statuses` values
  (1, 'Pending', '#41b8e3', '#ffffff', '1px 1px #1e83a8', '0px 1px 1px 0px #1e83a8'),
  (2, 'In Progress', '#88ce5c', '#ffffff', '1px 1px #5ca534', '0px 1px 1px 0px #62a33d'),
  (3, 'Waiting', '#ffa123', '#ffffff', '1px 1px #cd7e15', '0px 1px 1px 0px #cd7e15'),
  (4, 'Suspended', '#9a9a9a', '#ffffff', '1px 1px #787878', '0px 1px 1px 0px #787878'),
  (5, 'Abandoned', '#eb4141', '#ffffff', '1px 1px #b32222', '0px 1px 1px 0px #b32222');

-- split --

insert into `{DBPREFIX}users` (`id`, `group_id`, `ip_address`, `username`, `password`, `salt`, `email`, `activation_code`, `forgotten_password_code`, `remember_code`, `created_on`, `last_login`, `active`, `date_updated`)
values
  (1, 1, '127.0.0.1', '{USERNAME}', '{PASSWORD}', '{SALT}', '{NOTIFY_EMAIL}',
      '', null, null, '{NOW}', '{NOW}', 1, '{NOW_DATETIME}');

-- split --

create table if not exists `{DBPREFIX}email_templates` (
  `id`      int(11)      not null auto_increment,
  `type`    varchar(255) not null,
  `name`    varchar(255) not null,
  `subject` varchar(255) not null,
  `content` text         not null,
  `days`    tinyint(4)   null,
  `created` int(11)      not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

insert into `{DBPREFIX}email_templates` (`id`, `type`, `name`, `subject`, `content`, `days`, `created`)
values (1, 'invoice', 'Friendly Reminder', 'Reminder for invoice #{{invoice.invoice_number}}',
        'Your invoice #{{invoice.invoice_number}} is due, please review as soon as possible. If you would like to pay it immediately using your credit card (via PayPal) please click <a href=\"{{invoice.url}}\">{{invoice.url}}</a>\n\nThanks,\n{{settings.admin_name}}',
        14, 0);

-- split --

create table if not exists `{DBPREFIX}tickets` (
  `id`               int(10) unsigned  not null auto_increment,
  `client_id`        int(10) unsigned  not null,
  `assigned_user_id` int(10) unsigned  null,
  `status_id`        int(10) unsigned  not null,
  `priority_id`      int(10) unsigned  not null,
  `subject`          varchar(255)      not null default '',
  `resolved`         tinyint(1)        not null,
  `created`          int(10) unsigned  not null,
  `owner_id`         int(255) unsigned not null default '0',
  `is_paid`          tinyint(1)        not null default '0',
  `invoice_id`       int(255)          not null default '0',
  `is_archived`      tinyint(1)        not null default '0',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}ticket_posts` (
  `id`            int(10) unsigned not null auto_increment,
  `ticket_id`     int(10) unsigned not null,
  `user_id`       int(10) unsigned null,
  `user_name`     varchar(255)     not null,
  `message`       text             null,
  `orig_filename` varchar(255)     not null,
  `real_filename` text             not null,
  `created`       int(10) unsigned not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}ticket_history` (
  `id`        int(10) unsigned not null auto_increment,
  `ticket_id` int(10) unsigned not null,
  `user_id`   int(10) unsigned null,
  `status_id` int(10) unsigned not null,
  `user_name` varchar(255)     not null,
  `created`   int(10) unsigned not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}ticket_statuses` (
  `id`               int(11)      not null auto_increment,
  `title`            varchar(255) not null,
  `background_color` varchar(50)  not null,
  `font_color`       varchar(50)  not null,
  `text_shadow`      varchar(50)  not null,
  `box_shadow`       varchar(50)  not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}ticket_priorities` (
  `id`               int(11)      not null auto_increment,
  `title`            varchar(255) not null,
  `background_color` varchar(50)  not null,
  `font_color`       varchar(50)  not null,
  `text_shadow`      varchar(50)  not null,
  `box_shadow`       varchar(50)  not null,
  `default_rate`     float                 default '0',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

insert into `{DBPREFIX}ticket_statuses` (`id`, `title`, `background_color`, `font_color`, `text_shadow`, `box_shadow`)
values
  (1, 'Pending', '#41b8e3', '#ffffff', '1px 1px #1e83a8', '0px 1px 1px 0px #1e83a8'),
  (2, 'Open', '#88ce5c', '#ffffff', '1px 1px #5ca534', '0px 1px 1px 0px #62a33d'),
  (3, 'Closed', '#9a9a9a', '#ffffff', '1px 1px #787878', '0px 1px 1px 0px #787878');

-- split --

insert into `{DBPREFIX}ticket_priorities` (`id`, `title`, `background_color`, `font_color`, `text_shadow`, `box_shadow`)
values
  (1, 'Normal', '#41b8e3', '#ffffff', '1px 1px #1e83a8', '0px 1px 1px 0px #1e83a8'),
  (2, 'Elevated', '#88ce5c', '#ffffff', '1px 1px #5ca534', '0px 1px 1px 0px #62a33d'),
  (3, 'Urgent', '#eb4141', '#ffffff', '1px 1px #b32222', '0px 1px 1px 0px #b32222');

-- split --

create table `{DBPREFIX}email_settings_templates` (
  `id`           int(11)      not null auto_increment,
  `identifier`   varchar(255) not null,
  `subject`      varchar(255) not null,
  `message`      text         not null,
  `type`         varchar(255) not null,
  `template`     varchar(255) not null default 'default',
  `date_added`   timestamp    not null default CURRENT_TIMESTAMP,
  `date_updated` datetime     not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

insert into `{DBPREFIX}email_settings_templates` (`id`, `identifier`, `subject`, `message`, `type`, `template`, `date_added`, `date_updated`)
values (1, 'new_invoice', 'Invoice #{{number}}',
        'Hi {{invoice.first_name}} {{invoice.last_name}}\n\nYour invoice #{{invoice.invoice_number}} is ready, after review if you would like to pay it immediately using your credit card (via PayPal) please click <a href=\"{{invoice.url}}\">{{invoice.url}}</a>\n\nThanks,\n{{settings.admin_name}}',
        'html', 'default', '2013-12-09 01:17:58', '2013-12-09 01:17:58'),
    (2, 'new_estimate', 'Estimate #{{number}}',
     'Hi {{estimate.first_name}} {{estimate.last_name}}\n\nYour estimate #{{estimate.number}} is ready. To review it, please click <a href=\"{{estimate.url}}\">{{estimate.url}}</a>.\n\nThanks,\n{{settings.admin_name}}', 'html', 'default',
     '2013-12-09 01:17:58', '2013-12-09 01:17:58'),
    (3, 'new_proposal', 'Proposal #{{number}} - {{title}}', 'Hi {{proposal.client_name}}\n\nA new proposal is ready for you on {{settings.site_name}}:\n\n{{proposal.url}}\n\nThanks,\n{{settings.admin_name}}', 'html', 'default',
     '2013-12-09 01:17:58', '2013-12-09 01:17:58'),
    (4, 'invoice_payment_notification_for_admin', 'Received payment for Invoice #{{number}}',
     '{{client.display_name}} has made a {{gateway.title}} payment for Invoice #{{invoice.invoice_number}}.\n\nThe amount paid was: {{ipn.payment_amount}}\n{{#invoice.is_paid}}This invoice is now fully paid.{{/invoice.is_paid}}\n{{^invoice.is_paid}}This invoice still has {{invoice.unpaid_amount}} outstanding.{{/invoice.is_paid}}',
     'html', 'default', '2013-12-09 01:17:58', '2013-12-09 01:17:58'),
    (5, 'invoice_payment_notification_for_client', 'Your payment has been received for Invoice #{{number}}',
     'Thank you for your payment.\n\nInvoice #{{invoice.invoice_number}}\nThe amount paid was: {{ipn.payment_amount}}\n{{#invoice.is_paid}}This invoice is now fully paid. {{#invoice.has_files}}You have files available for download at: {{invoice.url}}{{/invoice.has_files}}{{/invoice.is_paid}}\n{{^invoice.is_paid}}This invoice still has {{invoice.unpaid_amount}} outstanding.{{/invoice.is_paid}}\n\nThanks,\n{{settings.admin_name}}',
     'html', 'default', '2013-12-09 01:17:58', '2013-12-09 01:17:58'),
    (6, 'new_ticket', 'Ticket Received - #{{ticket.id}}',
     'Hi {{ticket.name}}\n\nA new support ticket (#{{ticket.id}}) has been received on {{settings.site_name}}:\n\nYou may view and update this ticket by clicking <a href=\"{{ticket.url}}\">here</a>.\n\nThanks,\n{{settings.admin_name}}',
     'html', 'default', '2013-12-09 01:17:58', '2013-12-09 01:17:58'),
    (7, 'new_ticket_invoice', 'Invoice for Ticket #{{ticket.id}}',
     'Hi {{ticket.name}}\n\nYour invoice <a href=\"{{ticket.invoice_url}}\">{{ticket.invoice_number}}</a> for ticket #{{ticket.id}} is ready. You may review and pay this invoice by going to the following link: <a href=\"{{ticket.invoice_url}}\">{{ticket.invoice_url}}</a>.\n\nThanks,\n{{settings.admin_name}}',
     'html', 'default', '2013-12-09 01:17:58', '2013-12-09 01:17:58'),
    (8, 'ticket_updated', 'Ticket Updated - #{{ticket.id}}',
     'Hi {{ticket.name}}\n\nTicket (#{{ticket.id}}) has been updated on {{settings.site_name}}:\n\nYou may view and update this ticket by clicking <a href=\"{{ticket.url}}\">here</a>.\n\nThanks,\n{{settings.admin_name}}', 'html', 'default',
     '2013-12-09 01:17:58', '2013-12-09 01:17:58'),
    (9, 'ticket_status_updated', 'Ticket Status Updated - #{{ticket.id}}',
     'Hi {{ticket.name}}\n\nThe status of ticket (#{{ticket.id}}) has been set to {{ticket.status}} on {{settings.site_name}}:\n\nYou may view and update this ticket by clicking <a href=\"{{ticket.url}}\">here</a>.\n\nThanks,\n{{settings.admin_name}}',
     'html', 'default', '2013-12-09 01:17:58', '2013-12-09 01:17:58'),
    (10, 'assigned_to_task', 'You\'ve been assigned to a task in {{project.name}}!',
     'Task Name: {{task.name}}\nProject: {{project.name}}\nTask Status: {{task.status}}\nDue Date: {{task.due_date}}\nProjected Hours: {{task.projected_hours}}\nTask Notes: {{task.notes}}\n', 'html', 'default', '2013-12-09 01:17:58',
     '2013-12-09 01:17:58'),
    (11, 'assigned_to_milestone', 'You\'ve been assigned to a milestone in {{project.name}}!', 'Milestone Name: {{milestone.name}}\nProject: {{project.name}}\nTarget Date: {{milestone.target_date}}\n\n{{milestone.description}}\n', 'html',
     'default', '2013-12-09 01:17:58', '1970-01-01 00:00:00'),
    (12, 'new_comment', '{{comment.user_name}} commented on {{item}}', '{{comment.user_name}}\'s comment follows:\n\n---\n\n{{comment.comment}}\n\n---\n\nYou can reply to this comment by clicking <a href=\"{{comment.url}}\">here</a>.',
     'html', 'default', '2013-12-09 02:12:11', '2013-12-09 02:12:11'),
    (13, 'client_area_details', 'Your Client Area Details',
     'Hi {{client.first_name}} {{client.last_name}},\n\nYou can access your client area at: <a href=\"{{client.access_url}}\">{{client.access_url}}</a>\n\nYour email is: {{client.email}}\n{{#client.passphrase}}Your password is: {{client.passphrase}}{{/client.passphrase}}\n{{^client.passphrase}}You don\'t need to enter a password.{{/client.passphrase}}\n\nThanks,\n{{settings.admin_name}}',
     'html', 'default', '2013-12-09 02:12:11', '2013-12-09 02:12:11'),
    (14, 'new_credit_note', 'Credit Note #{{number}}',
     'Hi {{credit_note.first_name}} {{credit_note.last_name}}\n\nYour credit note #{{credit_note.number}} is ready. To review it, please click <a href=\"{{credit_note.url}}\">{{credit_note.url}}</a>.\n\nThanks,\n{{settings.admin_name}}',
     'html', 'default', '2013-12-09 02:12:11', '2013-12-09 02:12:11'),
    (15, 'estimate_rejected', 'Estimate #{{number}} Rejected', 'Estimate #{number} was rejected.\n\nYou can review it at: <a href=\"{{estimate.url}}\">{{estimate.url}}</a>', 'html', 'default', '2016-02-28 12:58:08', '2016-02-28 12:58:08'),
    (16, 'estimate_accepted', 'Estimate #{{number}} Accepted', 'Estimate #{number} was accepted.\n\nYou can review it at: <a href=\"{{estimate.url}}\">{{estimate.url}}</a>', 'html', 'default', '2016-02-28 12:58:08', '2016-02-28 12:58:08'),
    (17, 'proposal_rejected', 'Proposal #{{number}} Rejected', 'Proposal #{number} was rejected.\n\nYou can review it at: <a href=\"{{proposal.url}}\">{{proposal.url}}</a>', 'html', 'default', '2016-02-28 12:58:08', '2016-02-28 12:58:08'),
    (18, 'proposal_accepted', 'Proposal #{{number}} Accepted', 'Proposal #{number} was accepted.\n\nYou can review it at: <a href=\"{{proposal.url}}\">{{proposal.url}}</a>', 'html', 'default', '2016-02-28 12:58:08', '2016-02-28 12:58:08');

-- split --

create table if not exists `{DBPREFIX}ci_sessions` (
  session_id    varchar(40) default '0'    not null,
  ip_address    varchar(45) default '0'    not null,
  user_agent    varchar(120)               not null,
  last_activity int(10) unsigned default 0 not null,
  user_data     text                       not null,
  primary key (session_id),
  key `last_activity_idx` (`last_activity`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table `{DBPREFIX}project_milestone_templates` (
  `id`               int(10) unsigned not null auto_increment,
  `name`             varchar(255)     not null,
  `description`      text,
  `project_id`       int(10) unsigned not null,
  `assigned_user_id` int(10) unsigned          default null,
  `color`            varchar(50)      not null,
  `is_viewable`      tinyint(1)       not null,
  `order`            int(11) unsigned not null default '0',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table `{DBPREFIX}business_identities` (
  `id`                        int(11) unsigned not null auto_increment,
  `site_name`                 varchar(1024)    not null default '',
  `brand_name`                varchar(1024)    not null default '',
  `admin_name`                varchar(1024)    not null default '',
  `mailing_address`           varchar(1024)    not null default '',
  `notify_email`              varchar(1024)    not null default '',
  `billing_email`             varchar(1024)    not null default '',
  `notify_email_from`         varchar(1024)    not null default '',
  `billing_email_from`        varchar(1024)    not null default '',
  `logo_filename`             varchar(1024)    not null default '',
  `show_name_along_with_logo` tinyint(1)       null     default null,
  `logo_width`                int(11) unsigned          default null,
  `logo_height`               int(11) unsigned          default null,
  `default_invoice_notes`     longtext,
  `pdf_footer_contents`       longtext,
  `remittance_slip`           longtext,
  `include_remittance_slip`   tinyint(1)       not null default '1',
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

insert into `{DBPREFIX}business_identities` (site_name, brand_name, admin_name, mailing_address, notify_email, billing_email, notify_email_from, billing_email_from)
values
  ('{SITE_NAME}', '{SITE_NAME}', '{FIRST_NAME} {LAST_NAME}', '{MAILING_ADDRESS}', '{NOTIFY_EMAIL}', '{NOTIFY_EMAIL}',
   '{FIRST_NAME} {LAST_NAME}', '{FIRST_NAME} {LAST_NAME}');

-- split --

create table if not exists `{DBPREFIX}clients_credit_alterations` (
  `id`         int(11) unsigned not null auto_increment,
  `client_id`  int(11)          not null,
  `amount`     decimal(65, 10)  not null,
  `created_at` timestamp        null     default CURRENT_TIMESTAMP,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}clients_meta` (
  `id`        int(11) unsigned not null auto_increment,
  `client_id` int(11)          not null,
  `label`     varchar(1024)    not null default '',
  `slug`      varchar(1024)    not null default '',
  `value`     text             not null,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}clients_taxes` (
  `id`                  int(11) unsigned not null auto_increment,
  `client_id`           int(11) unsigned not null,
  `tax_id`              int(5) unsigned  not null,
  `tax_registration_id` varchar(1024)    not null default '',
  `is_default`          tinyint(1)       not null default '0',
  primary key (`id`),
  key `clients_taxes_rel_client_id` (`client_id`),
  constraint `clients_taxes_rel_client_id` foreign key (`client_id`) references `{DBPREFIX}clients` (`id`)
    on delete cascade
    on update cascade,
  constraint `clients_taxes_rel_tax_id` foreign key (`tax_id`) references `{DBPREFIX}taxes` (`id`)
    on delete cascade
    on update cascade
)
  engine = InnoDB
  default charset = utf8;

-- split --

create table if not exists `{DBPREFIX}error_logs` (
  `id`                 int(11) unsigned not null auto_increment,
  `subject`            varchar(1024)    not null default '',
  `occurrences`        int(11)          not null default '1',
  `first_occurrence`   timestamp        not null default CURRENT_TIMESTAMP,
  `latest_occurrence`  timestamp        null     default null,
  `contents`           longtext         not null,
  `is_reported`        tinyint(1)       not null default '0',
  `is_reportable`      tinyint(1)       not null default '0',
  `notification_email` varchar(1024)    not null default '',
  `error_id`           varchar(1024)    not null default '',
  `url`                text,
  primary key (`id`)
)
  engine = InnoDB
  default charset = utf8;
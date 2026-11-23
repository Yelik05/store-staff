<?php
/* api_routes.php — action 路由表 */

require_once __DIR__ . '/auth_actions.php';
require_once __DIR__ . '/staff_actions.php';
require_once __DIR__ . '/salary_actions.php';
require_once __DIR__ . '/attendance_actions.php';
require_once __DIR__ . '/score_actions.php';
require_once __DIR__ . '/leave_actions.php';
require_once __DIR__ . '/shift_actions.php';
require_once __DIR__ . '/notice_actions.php';
require_once __DIR__ . '/reimburse_actions.php';
require_once __DIR__ . '/task_actions.php';
require_once __DIR__ . '/care_actions.php';
require_once __DIR__ . '/schedule_actions.php';
require_once __DIR__ . '/webhook_actions.php';
require_once __DIR__ . '/public_actions.php';
require_once __DIR__ . '/health_verify_actions.php';
require_once __DIR__ . '/file_actions.php';
require_once __DIR__ . '/settings_actions.php';
require_once __DIR__ . '/feedback_actions.php';
require_once __DIR__ . '/expiry_actions.php';
require_once __DIR__ . '/daily_shift_actions.php';
require_once __DIR__ . '/push_actions.php';

function api_routes()
{
    return array(
        'auth.bootstrap' => 'api_auth_bootstrap',
        'auth.login' => 'api_auth_login',
        'auth.logout' => 'api_auth_logout',
        'auth.appLogin' => 'api_auth_app_login',
        'auth.appSession' => 'api_auth_app_session',
        'auth.appRefresh' => 'api_auth_app_refresh',
        'auth.appLogout' => 'api_auth_app_logout',
        'auth.register' => 'api_auth_register',
        'auth.checkUnique' => 'api_auth_check_unique',
        'auth.resubmit' => 'api_auth_resubmit',

        'staff.me' => 'api_staff_me',
        'staff.updateMe' => 'api_staff_update_me',
        'staff.saveMe' => 'api_staff_save_me',
        'staff.list' => 'api_staff_list',
        'staff.get' => 'api_staff_get',
        'staff.profile' => 'api_staff_profile',
        'staff.review' => 'api_staff_review',
        'staff.resign' => 'api_staff_resign',
        'staff.reactivate' => 'api_staff_reactivate',
        'staff.remark' => 'api_staff_remark',
        'staff.update' => 'api_staff_update',
        'staff.contacts' => 'api_staff_contacts',
        'staff.birthdays' => 'api_staff_birthdays',

        'shift.stations' => 'api_shift_stations',
        'shift.today' => 'api_daily_shift_today',
        'shift.get' => 'api_daily_shift_get',
        'shift.save' => 'api_daily_shift_save',
        'shift.board' => 'api_daily_shift_board',
        'shift.clear' => 'api_daily_shift_clear',

        'staff.corrections.list' => 'api_corrections_list',
        'staff.corrections.resolve' => 'api_corrections_resolve',

        'message.list' => 'api_message_list',
        'message.threads' => 'api_message_threads',
        'message.thread' => 'api_message_thread',
        'message.unread' => 'api_message_unread',
        'message.unreadList' => 'api_message_unread_list',
        'message.read' => 'api_message_read',
        'message.readAll' => 'api_message_read_all',
        'message.send' => 'api_message_send',
        'feedback.submit' => 'api_feedback_submit',
        'feedback.thread' => 'api_feedback_thread',
        'feedback.reply' => 'api_feedback_reply',

        'file.upload' => 'api_file_upload',
        'file.meta' => 'api_file_meta',

        'notify.feed' => 'api_notify_feed',
        'push.register' => 'api_push_register',
        'push.unregister' => 'api_push_unregister',
        'push.status' => 'api_push_status',

        'salary.get' => 'api_salary_get',
        'salary.myMonths' => 'api_salary_my_months',
        'salary.list' => 'api_salary_list',
        'salary.save' => 'api_salary_save',
        'salary.deleteDraft' => 'api_salary_delete_draft',
        'salary.publish' => 'api_salary_publish',
        'salary.withdraw' => 'api_salary_withdraw',
        'salary.markPaid' => 'api_salary_mark_paid',
        'salary.copyLastMonth' => 'api_salary_copy_last',
        'salary.import' => 'api_salary_import',

        'score.get' => 'api_score_get',
        'score.my' => 'api_score_my',
        'score.list' => 'api_score_list',
        'score.save' => 'api_score_save',
        'score.adjust' => 'api_score_adjust',
        'score.publish' => 'api_score_publish',
        'score.withdraw' => 'api_score_withdraw',
        'score.copyLastMonth' => 'api_score_copy_last',

        'settings.dimensions' => 'api_settings_dimensions',
        'settings.saveDimensions' => 'api_settings_save_dimensions',
        'settings.get' => 'api_settings_get',
        'settings.save' => 'api_settings_save',
        'schedule.list' => 'api_schedule_list',
        'schedule.save' => 'api_schedule_save',
        'schedule.cancel' => 'api_schedule_cancel',
        'schedule.remove' => 'api_schedule_remove',
        'settings.webhook.test' => 'api_webhook_test',
        'settings.webhook.testPersonal' => 'api_personal_webhook_test',
        'settings.webhook.preview' => 'api_webhook_preview',
        'settings.webhook.logs' => 'api_webhook_logs',

        'leave.my' => 'api_leave_my',
        'leave.quick' => 'api_leave_quick',
        'leave.dayStats' => 'api_leave_day_stats',
        'leave.apply' => 'api_leave_apply',
        'leave.cancel' => 'api_leave_cancel',
        'leave.list' => 'api_leave_list',
        'leave.review' => 'api_leave_review',
        'leave.manual' => 'api_leave_manual',

        'shift.my' => 'api_shift_my',
        'shift.apply' => 'api_shift_apply',
        'shift.cancel' => 'api_shift_cancel',
        'shift.list' => 'api_shift_list',
        'shift.review' => 'api_shift_review',

        'notice.employee.list' => 'api_notice_employee_list',
        'notice.unread' => 'api_notice_unread',
        'notice.employee.get' => 'api_notice_employee_get',
        'notice.markRead' => 'api_notice_mark_read',
        'notice.admin.list' => 'api_notice_admin_list',
        'notice.admin.save' => 'api_notice_admin_save',
        'notice.admin.withdraw' => 'api_notice_admin_withdraw',
        'notice.admin.delete' => 'api_notice_admin_delete',
        'notice.admin.readers' => 'api_notice_admin_readers',

        'reimburse.categories' => 'api_reimburse_categories',
        'reimburse.category.save' => 'api_reimburse_category_save',
        'reimburse.payees' => 'api_reimburse_payees',
        'reimburse.payee.save' => 'api_reimburse_payee_save',
        'reimburse.payee.delete' => 'api_reimburse_payee_delete',
        'reimburse.payee.default' => 'api_reimburse_payee_default',
        'reimburse.my' => 'api_reimburse_my',
        'reimburse.get' => 'api_reimburse_get',
        'reimburse.create' => 'api_reimburse_create',
        'reimburse.admin.list' => 'api_reimburse_admin_list',
        'reimburse.admin.get' => 'api_reimburse_admin_get',
        'reimburse.review' => 'api_reimburse_review',
        'reimburse.pay' => 'api_reimburse_pay',

        'task.employee.list' => 'api_task_employee_list',
        'task.employee.overdue' => 'api_task_overdue',
        'task.completed' => 'api_task_completed',
        'task.employee.submit' => 'api_task_employee_submit',
        'task.reassign' => 'api_task_reassign',
        'task.admin.templates' => 'api_task_admin_templates',
        'task.admin.template.save' => 'api_task_admin_template_save',
        'task.admin.template.toggle' => 'api_task_admin_template_toggle',
        'task.admin.template.delete' => 'api_task_admin_template_delete',
        'task.admin.instances' => 'api_task_admin_instances',
        'task.admin.review' => 'api_task_admin_review',
        'task.admin.approvals' => 'api_task_admin_approvals',
        'task.admin.approval.review' => 'api_task_admin_approval_review',
        'task.admin.detail' => 'api_task_admin_detail',
        'task.kinds' => 'api_task_kinds',
        'task.kind.save' => 'api_task_kind_save',
        'task.kind.delete' => 'api_task_kind_delete',
        'task.quick.create' => 'api_task_quick_create',
        'task.manage.complete' => 'api_task_manage_complete',
        'task.cron' => 'api_task_cron',

        'public.healthList' => 'api_public_health_list',
        'public.healthFile' => 'api_public_health_file',
        'public.healthMaterial' => 'api_public_health_material',
        'public.notice' => 'api_public_notice',
        'public.siteTitle' => 'api_public_site_title',

        'health.verify.list' => 'api_health_verify_list',
        'health.verify.history' => 'api_health_verify_history',
        'health.verify.save' => 'api_health_verify_save',

        'attendance.list' => 'api_attendance_list',
        'attendance.save' => 'api_attendance_save',
        'attendance.detail' => 'api_attendance_detail',
        'attendance.my' => 'api_attendance_my',
        'attendance.import' => 'api_attendance_import',

        'dashboard.get' => 'api_dashboard',

        'accounts.list' => 'api_accounts_list',
        'accounts.create' => 'api_accounts_create',
        'accounts.toggle' => 'api_accounts_toggle',
        'accounts.resetPassword' => 'api_account_reset_password',
        'accounts.changePassword' => 'api_account_change_password',

        'audit.list' => 'api_audit_list',
        'audit.log' => 'api_audit_log_add',

        'expiry.adminData' => 'api_expiry_admin_data',
        'expiry.config' => 'api_expiry_config',
        'expiry.categorySave' => 'api_expiry_category_save',
        'expiry.closeTimeSave' => 'api_expiry_close_time_save',
        'expiry.categoryToggle' => 'api_expiry_category_toggle',
        'expiry.materialSave' => 'api_expiry_material_save',
        'expiry.categoryDelete' => 'api_expiry_category_delete',
        'expiry.materialDelete' => 'api_expiry_material_delete',
        'expiry.materialBulk' => 'api_expiry_material_bulk',
        'expiry.checkData' => 'api_expiry_check_data',
        'expiry.checkSave' => 'api_expiry_check_save',
        'expiry.dueList' => 'api_expiry_due_list',
        'expiry.dayList' => 'api_expiry_day_list',
        'expiry.process' => 'api_expiry_process',

        'backup.export' => 'api_backup_export',
        'backup.restore' => 'api_backup_restore',
        'data.clear' => 'api_data_clear',
        'data.reset' => 'api_data_reset',

        'system.build' => 'api_system_build'
    );
}

/* 版本自检：供 version-check.html 确认线上后端是否已包含本次导入修复 */
function api_system_build($in)
{
    return array(
        'build' => '202611303',
        'appToken' => true,
        'appPush' => true,
        'attendanceImportRow' => function_exists('attendance_import_row'),
        'salaryImportRow' => function_exists('salary_import_row'),
        'attendanceFeishuMatch' => true,
        'salaryFeishuMatch' => true,
        'phpVersion' => PHP_VERSION
    );
}

function api_dispatch($action, $input)
{
    $routes = api_routes();
    if (!isset($routes[$action])) {
        throw new ApiException('接口不存在：' . $action, 'NOT_FOUND', 404);
    }
    $fn = $routes[$action];
    if (!function_exists($fn)) {
        throw new ApiException('接口加载失败：' . $action, 'SERVER_ERROR', 500);
    }
    return call_user_func($fn, $input);
}

package com.tastien.storestaff.nativeapp.ui.auth

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val phone: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null
)

class LoginViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(LoginUiState())
    val state = _state.asStateFlow()

    fun onPhoneChange(value: String) {
        val digits = value.filter { it.isDigit() }.take(11)
        _state.update { it.copy(phone = digits, error = null) }
    }

    fun onPasswordChange(value: String) {
        _state.update { it.copy(password = value, error = null) }
    }

    fun submit(onSuccess: () -> Unit) {
        val current = _state.value
        if (current.loading) return
        if (!Regex("^1[3-9]\\d{9}$").matches(current.phone)) {
            _state.update { it.copy(error = "请输入正确的 11 位手机号") }
            return
        }
        if (current.password.isBlank()) {
            _state.update { it.copy(error = "请输入密码") }
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                AuthRepository.login(current.phone, current.password)
                _state.update { it.copy(loading = false, password = "") }
                onSuccess()
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(loading = false, error = e.message ?: "登录已失效") }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message ?: "登录失败") }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = "登录失败，请稍后重试") }
            }
        }
    }
}

package com.tastien.storestaff.nativeapp.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.core.SessionStore
import com.tastien.storestaff.nativeapp.data.AuthRepository
import com.tastien.storestaff.nativeapp.push.PushRegistry
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AppState {
    data object Checking : AppState
    data object LoggedOut : AppState
    data class LoggedIn(val name: String, val role: String) : AppState
}

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow<AppState>(AppState.Checking)
    val state = _state.asStateFlow()

    fun bootstrap() {
        if (_state.value != AppState.Checking) return
        viewModelScope.launch {
            if (!SessionStore.hasToken) {
                _state.value = AppState.LoggedOut
                return@launch
            }
            try {
                AuthRepository.session()
                enter()
            } catch (e: SessionExpiredException) {
                _state.value = AppState.LoggedOut
            } catch (e: ApiException) {
                /* 断网时允许用本地缓存进入，首页会提示网络错误 */
                if (e.code == "NETWORK_ERROR") enter() else _state.value = AppState.LoggedOut
            } catch (e: Exception) {
                enter()
            }
        }
    }

    fun onLoginSuccess() {
        enter()
    }

    fun logout() {
        viewModelScope.launch {
            PushRegistry.unregister(getApplication())
            AuthRepository.logout()
            _state.value = AppState.LoggedOut
        }
    }

    fun forceLogout() {
        SessionStore.clear()
        _state.value = AppState.LoggedOut
    }

    private fun enter() {
        val name = SessionStore.staffName.ifBlank { SessionStore.accountName }
        val role = SessionStore.role
        _state.value = AppState.LoggedIn(name, role)
    }
}

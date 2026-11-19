<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class SaveUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('users');
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['email' => mb_strtolower(trim((string) $this->input('email')))]);
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($this->route('user')?->id)],
            'role_id' => ['required', 'integer', Rule::exists('roles', 'id')->whereIn('slug', ['super-admin', 'hr', 'finance'])],
            'is_active' => ['required', 'boolean'],
            'current_password' => ['required', 'current_password'],
            'password' => ['prohibited'], 'must_change_password' => ['prohibited'],
            'auth_version' => ['prohibited'], 'remember_token' => ['prohibited'],
        ];
    }
}

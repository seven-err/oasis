@props(['name', 'label', 'type' => 'text', 'value' => '', 'hint' => null, 'showError' => true])
<div class="field">
    <label for="{{ $name }}">{{ $label }}</label>
    <div class="input-group">
        <input id="{{ $name }}" name="{{ $name }}" type="{{ $type }}"
            value="{{ $type === 'password' ? '' : old($name, $value) }}"
            {{ $attributes }}
            @if($errors->has($name)) aria-invalid="true" @endif
            aria-describedby="{{ $name }}-help {{ $name }}-error">
        @if($type === 'password')
            <button class="password-toggle" type="button" data-password-toggle="{{ $name }}" aria-controls="{{ $name }}" aria-pressed="false" aria-label="Show {{ strtolower($label) }}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                    <path data-password-slash d="m3 3 18 18" visibility="hidden" />
                </svg>
            </button>
        @endif
    </div>
    <small id="{{ $name }}-help">{{ $hint }}</small>
    <small class="field-error" id="{{ $name }}-error">@if($showError) @error($name){{ $message }}@enderror @endif</small>
</div>
